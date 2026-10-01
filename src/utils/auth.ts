/**
 * 模块名称：auth.ts
 * 认证工具模块
 *
 * 功能描述：
 * - 提供用户登录和认证功能的基础工具函数
 * - 使用账号密码登录获取认证 Cookie
 * - 处理 Cookie 提取和验证
 *
 * 导出的函数：
 * - loginWithPassword: 使用邮箱和密码登录
 */

import { fetch } from 'undici';
import { CLI_VERSION, getAffineClientVersion } from './version.js';

/**
 * 请求超时时间（毫秒）
 */
const AUTH_FETCH_TIMEOUT_MS = 30_000;

/* ============================================================================
 * 辅助函数
 * ============================================================================ */

/**
 * 提取 Cookie 对
 *
 * 从 Set-Cookie 头数组中提取键值对，组合成 Cookie 字符串
 *
 * @param setCookies - Set-Cookie 头数组
 * @returns 格式化的 Cookie 字符串（如 "token1=xxx; token2=yyy"）
 *
 * @example
 * const cookies = ['session=abc123; Path=/', 'user=john; Path=/'];
 * extractCookiePairs(cookies); // "session=abc123; user=john"
 */
function extractCookiePairs(setCookies: string[]): string {
	const pairs: string[] = [];
	for (const sc of setCookies) {
		const first = sc.split(';')[0];
		if (first) pairs.push(first.trim());
	}
	return pairs.join('; ');
}

/**
 * 检查是否包含 CR/LF 字符（防止头部注入）
 *
 * @param value - 要检查的值
 * @param label - 标签名称（用于错误信息）
 * @throws 如果值包含 CR/LF 字符则抛出错误
 */
function assertNoCRLF(value: string, label: string): void {
	if (/[\r\n]/.test(value)) {
		throw new Error(`${label} 包含非法的 CR/LF 字符`);
	}
}

/* ============================================================================
 * 公共接口
 * ============================================================================ */

/**
 * 使用账号密码登录
 *
 * 向 Affine 服务器发送登录请求，获取认证 Cookie
 *
 * @param baseUrl - Affine 服务器基础 URL
 * @param email - 用户邮箱
 * @param password - 用户密码
 * @returns 登录结果对象 { cookieHeader }
 * @throws 登录失败、请求超时、未收到 Cookie
 *
 * @example
 * const { cookieHeader } = await loginWithPassword('https://app.affine.pro', 'user@example.com', 'password');
 */
export async function loginWithPassword(
	baseUrl: string,
	email: string,
	password: string
): Promise<{ cookieHeader: string }> {
	const url = `${baseUrl.replace(/\/$/, '')}/api/auth/sign-in`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
	let res;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': `affine-cli/${CLI_VERSION}`,
				'x-affine-version': getAffineClientVersion()
			},
			body: JSON.stringify({ email, password }),
			signal: controller.signal
		});
	} catch (err: any) {
		if (err.name === 'AbortError')
			throw new Error(`登录请求超时 (${AUTH_FETCH_TIMEOUT_MS / 1000}s)`);
		throw err;
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		const raw = await res.text().catch(() => '');
		const sanitized = raw
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		const truncated = sanitized.length > 200 ? sanitized.slice(0, 200) + '...' : sanitized;
		throw new Error(`登录失败: ${res.status} ${truncated}`);
	}

	const anyHeaders = res.headers as any;
	let setCookies: string[] = [];
	if (typeof anyHeaders.getSetCookie === 'function') {
		setCookies = anyHeaders.getSetCookie();
	} else {
		const sc = res.headers.get('set-cookie');
		if (sc) setCookies = [sc];
	}

	if (!setCookies.length) {
		throw new Error('登录成功但未收到 Set-Cookie');
	}

	const cookieHeader = extractCookiePairs(setCookies);
	assertNoCRLF(cookieHeader, 'Cookie header from sign-in');
	return { cookieHeader };
}
