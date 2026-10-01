/**
 * 模块名称：authSession.ts
 * 认证会话解析模块
 *
 * 功能描述：
 * - 为 GraphQL / WebSocket / multipart 等所有消费者提供统一的认证凭据
 * - 优先使用配置中的 AFFINE_COOKIE（0.27+ 推荐的会话 Cookie）
 * - 若无 Cookie 但配置了 AFFINE_EMAIL + AFFINE_PASSWORD，则自动登录获取 Cookie
 * - 进程内单飞（single-flight）：并发调用只触发一次解析/登录
 *
 * 背景：
 * AFFiNE 0.27 移除了 Personal Access Token 的 GraphQL 签发接口，
 * 因此改用「邮箱/密码 → session cookie」认证。
 *
 * 导出的函数：
 * - resolveAuth: 解析当前认证快照
 * - clearAuthCache: 清除进程内认证缓存
 */

import { loginWithPassword } from './auth.js';
import { loadConfig } from './config.js';

/**
 * AuthSnapshot: 认证快照
 *
 * - cookie: 使用会话 Cookie
 * - none: 未配置任何认证信息
 */
export type AuthSnapshot = { kind: 'cookie'; cookie: string } | { kind: 'none' };

let cachedAuth: Promise<AuthSnapshot> | null = null;

/**
 * clearAuthCache: 清除进程内认证缓存
 *
 * 登录/登出后应调用，确保后续请求使用最新凭据。
 */
export function clearAuthCache(): void {
	cachedAuth = null;
}

/**
 * resolveAuthInternal: 实际解析逻辑（不含缓存）
 *
 * @returns 认证快照
 * @throws 自动登录失败时抛出错误
 */
async function resolveAuthInternal(): Promise<AuthSnapshot> {
	const config = loadConfig();

	if (config.cookie) {
		return { kind: 'cookie', cookie: config.cookie };
	}

	if (config.email && config.password) {
		const { cookieHeader } = await loginWithPassword(
			config.baseUrl,
			config.email,
			config.password
		);
		return { kind: 'cookie', cookie: cookieHeader };
	}

	return { kind: 'none' };
}

/**
 * resolveAuth: 解析当前认证快照（进程内单飞）
 *
 * 解析优先级：
 * 1. 配置中的 AFFINE_COOKIE
 * 2. AFFINE_EMAIL + AFFINE_PASSWORD 自动登录
 * 3. 无认证
 *
 * @returns 认证快照 Promise
 * @throws 自动登录失败时抛出错误（失败后清除缓存，允许后续重试）
 */
export function resolveAuth(): Promise<AuthSnapshot> {
	if (!cachedAuth) {
		cachedAuth = resolveAuthInternal().catch((err) => {
			cachedAuth = null;
			throw err;
		});
		// 避免异步启动时的未处理拒绝
		void cachedAuth.catch(() => {});
	}
	return cachedAuth;
}
