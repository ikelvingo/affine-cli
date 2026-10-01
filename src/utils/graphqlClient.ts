/**
 * 模块名称：graphqlClient.ts
 * GraphQL 客户端模块
 *
 * 功能描述：
 * - 提供与 Affine GraphQL API 交互的功能
 * - 采用会话 Cookie 认证（AFFiNE 0.27+ 不再支持 Personal Access Token）
 * - 自动注入 x-affine-version 与 x-affine-csrf-token 头
 * - 处理请求超时、认证过期等错误
 *
 * 导出的类和函数：
 * - GraphQLClient: GraphQL 客户端类
 * - createGraphQLClient: 创建 GraphQL 客户端实例
 * - clearGraphQLClientCache: 清除客户端缓存
 */

import { fetch } from 'undici';
import { loadConfig } from './config.js';
import { resolveAuth } from './authSession.js';
import { CLI_VERSION, getAffineClientVersion } from './version.js';

const GRAPHQL_FETCH_TIMEOUT_MS = 30_000;

/**
 * 从 Cookie 头中提取指定 Cookie 的值
 *
 * @param cookieHeader - 完整 Cookie 头（如 "affine_session=xxx; affine_csrf_token=yyy"）
 * @param name - 要提取的 Cookie 名称
 * @returns Cookie 值，未找到时返回空字符串
 */
export function extractCookieValue(cookieHeader: string, name: string): string {
	for (const part of cookieHeader.split(';')) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		if (trimmed.slice(0, eq) === name) {
			return trimmed.slice(eq + 1);
		}
	}
	return '';
}

/**
 * 判断响应是否为认证失败
 *
 * @param status - HTTP 状态码
 * @param json - 响应 JSON（可能为 undefined）
 * @returns 是否认证失败
 */
function isAuthError(status: number, json: any): boolean {
	if (status === 401) return true;
	const errors: any[] = json?.errors || [];
	return errors.some((e) => e?.extensions?.code === 'AUTHENTICATION_REQUIRED');
}

const AUTH_EXPIRED_HINT =
	'认证失败或会话已过期。请重新运行: affine-cli auth login\n' +
	'（也可通过 AFFINE_COOKIE 或 AFFINE_EMAIL/AFFINE_PASSWORD 环境变量配置认证）';

/**
 * GraphQL 客户端类（Cookie 认证）
 */
export class GraphQLClient {
	private _headers: Record<string, string>;
	private authenticated: boolean = false;

	constructor(
		private _endpoint: string,
		headers?: Record<string, string>
	) {
		this._headers = { ...(headers || {}) };
		if (this._headers.Cookie || this._headers.cookie) {
			this.authenticated = true;
		}
	}

	/** GraphQL 端点 URL */
	get endpoint(): string {
		return this._endpoint;
	}

	/** 获取当前请求头 */
	get headers(): Record<string, string> {
		return { ...this._headers };
	}

	/** 获取 Cookie 值 */
	get cookie(): string {
		return this._headers['Cookie'] || this._headers['cookie'] || '';
	}

	/** 检查是否已配置认证 */
	isAuthenticated(): boolean {
		return this.authenticated;
	}

	/**
	 * 构建完整请求头
	 *
	 * 包含 User-Agent、x-affine-version、cookie 认证头以及派生的 CSRF 头。
	 * 供 request() 与 multipart 上传等消费者共用。
	 *
	 * @param extra - 额外请求头
	 * @returns 完整请求头
	 */
	buildHeaders(extra?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			'User-Agent': `affine-cli/${CLI_VERSION}`,
			'x-affine-version': getAffineClientVersion(),
			...this._headers,
			...extra
		};

		// Cookie 认证时附带 CSRF 头（AFFiNE 对状态变更操作做 CSRF 校验）
		const cookie = this.cookie;
		if (cookie && !headers['x-affine-csrf-token']) {
			const csrf = extractCookieValue(cookie, 'affine_csrf_token');
			if (csrf) headers['x-affine-csrf-token'] = csrf;
		}

		return headers;
	}

	/**
	 * 执行 GraphQL 请求
	 * @param query 查询语句
	 * @param variables 查询变量
	 * @returns 查询结果
	 */
	async request<T>(query: string, variables?: Record<string, any>): Promise<T> {
		const headers = this.buildHeaders({ 'Content-Type': 'application/json' });

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), GRAPHQL_FETCH_TIMEOUT_MS);
		let res;
		try {
			res = await fetch(this.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify({ query, variables }),
				signal: controller.signal
			});
		} catch (err: any) {
			if (err.name === 'AbortError')
				throw new Error(`请求超时 (${GRAPHQL_FETCH_TIMEOUT_MS / 1000}s)`);
			throw err;
		} finally {
			clearTimeout(timer);
		}

		if (!res.ok) {
			let body: string;
			let json: any;
			try {
				json = (await res.json()) as any;
				body = json.errors?.map((e: any) => e.message).join('; ') || JSON.stringify(json);
			} catch {
				body = await res.text().catch(() => '(无法读取响应体)');
			}
			if (isAuthError(res.status, json)) {
				throw new Error(AUTH_EXPIRED_HINT);
			}
			throw new Error(`GraphQL HTTP ${res.status}: ${body}`);
		}

		const json = (await res.json()) as any;
		if (json.errors) {
			if (isAuthError(res.status, json)) {
				throw new Error(AUTH_EXPIRED_HINT);
			}
			const msg = json.errors.map((e: any) => e.message).join('; ');
			throw new Error(`GraphQL 错误: ${msg}`);
		}
		return json.data as T;
	}
}

let cachedClient: GraphQLClient | null = null;

export function clearGraphQLClientCache() {
	cachedClient = null;
}

/**
 * 创建 GraphQL 客户端实例
 *
 * 通过 resolveAuth() 获取认证快照：
 * - 有 Cookie → 注入 Cookie 头
 * - 配置了邮箱/密码 → 自动登录后使用 Cookie
 * - 无认证 → 抛出错误，提示登录
 *
 * @returns GraphQL 客户端
 * @throws 未配置认证信息时抛出错误
 */
export async function createGraphQLClient(): Promise<GraphQLClient> {
	if (cachedClient) return cachedClient;

	const config = loadConfig();
	const auth = await resolveAuth();

	if (auth.kind !== 'cookie') {
		throw new Error(
			'未配置认证信息。请运行 affine-cli auth login，或设置 AFFINE_COOKIE 环境变量'
		);
	}

	const gql = new GraphQLClient(`${config.baseUrl}/graphql`, { Cookie: auth.cookie });

	cachedClient = gql;
	return gql;
}
