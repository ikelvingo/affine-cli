/**
 * 认证 CLI 模块
 * 提供登录、登出、状态查询等认证相关命令
 */

import { CommandConfig, generateCommandMap } from '../utils/cliUtils.js';
import { authLoginHandler, authLogoutHandler, authStatusHandler } from '../core/auth.js';

// /**
//  * 解析配置路径参数
//  * 根据 --local 参数确定配置文件的保存位置
//  *
//  * @param isLocal - 是否保存到本地目录
//  * @returns 配置文件的完整路径
//  */
// function resolveConfigPath(isLocal?: boolean): string {
// 	return isLocal ? process.cwd() + '/.env' : '全局配置';
// }

/**
 * 认证命令配置
 * 定义所有认证相关命令的参数和处理器映射
 */
const authCommands: Record<string, CommandConfig> = {
	/**
	 * login 命令：使用邮箱/密码登录并保存会话 Cookie
	 * 用法：login [--url <url>] [--workspace <workspace-id>] [--local] [--force]
	 */
	login: {
		name: 'login',
		description: '使用邮箱/密码登录（保存会话 Cookie）',
		usage: 'login [--url <url>] [--workspace <workspace-id>] [--local] [--force]',
		args: [
			{
				name: 'url',
				short: 'u',
				description: 'Affine 服务器 URL（默认 https://app.affine.pro）',
				type: 'string'
			},
			{
				name: 'workspace',
				short: 'w',
				description: '工作区 ID（可选，自动检测）',
				type: 'string'
			},
			{
				name: 'local',
				description: '保存到当前目录（.env）而非全局配置',
				type: 'boolean'
			},
			{
				name: 'force',
				short: 'f',
				description: '强制覆盖现有配置，不询问确认',
				type: 'boolean'
			}
		],
		handler: authLoginHandler
	},

	/**
	 * logout 命令：退出登录
	 * 用法：logout [--local]
	 */
	logout: {
		name: 'logout',
		description: '退出登录，删除登录信息',
		usage: 'logout [--local]',
		args: [
			{
				name: 'local',
				description: '删除本地配置（.env）而非全局配置',
				type: 'boolean'
			}
		],
		handler: authLogoutHandler
	},

	/**
	 * status 命令：获取登录状态
	 * 用法：status [--json]
	 */
	status: {
		name: 'status',
		description: '获取当前登录状态',
		usage: 'status [--json]',
		args: [
			{
				name: 'json',
				description: '以 JSON 格式输出详细信息',
				type: 'boolean'
			}
		],
		handler: authStatusHandler
	}
};

/**
 * 认证 CLI 操作映射
 * 将命令配置转换为命令映射，供 CLI 入口使用
 */
export const runAuthCommands = generateCommandMap(authCommands);
