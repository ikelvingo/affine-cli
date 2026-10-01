/**
 * 模块名称：version.ts
 * 版本信息模块
 *
 * 功能描述：
 * - 从 package.json 导入版本号（构建时替换 %%VERSION%%）
 * - 提供 AFFiNE 客户端版本（用于 x-affine-version 头与 WebSocket clientVersion）
 */

export const CLI_VERSION = '%%VERSION%%';

/**
 * AFFiNE 客户端版本默认值
 *
 * AFFiNE 0.27+ 服务端要求客户端版本不低于 0.26，缺失或过低会返回
 * 403 UNSUPPORTED_CLIENT_VERSION。可通过环境变量 AFFINE_CLIENT_VERSION 覆盖。
 */
export const DEFAULT_AFFINE_CLIENT_VERSION = '0.26.0';

/**
 * 获取当前生效的 AFFiNE 客户端版本
 *
 * @returns AFFINE_CLIENT_VERSION 环境变量值，未设置时返回默认值
 */
export function getAffineClientVersion(): string {
	return process.env.AFFINE_CLIENT_VERSION || DEFAULT_AFFINE_CLIENT_VERSION;
}
