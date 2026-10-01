/**
 * 认证核心模块
 * 处理登录、登出、状态查询等认证相关操作
 *
 * 认证方式（AFFiNE 0.27+）：
 * 1. 邮箱/密码登录 → 获取并保存会话 Cookie（默认，推荐）
 * 2. 会话 Cookie（从浏览器复制，或通过 AFFINE_COOKIE 环境变量提供）
 *
 * 说明：
 * AFFiNE 0.27 起不再支持 Personal Access Token 的 GraphQL 签发接口，
 * 因此本项目已完全切换到 Cookie 认证，不再保存 API Token。
 *
 * 配置存储：
 * - 全局配置：~/.affine-cli/affine-cli.env
 * - 本地配置：当前目录 .env
 */

import * as readline from 'readline';
import {
	loadConfigFile,
	writeConfigFile,
	validateBaseUrl,
	redactSecret,
	loadConfig,
	clearConfigCache,
	GLOBAL_CONFIG_FILE
} from '../utils/config.js';
import { loginWithPassword } from '../utils/auth.js';
import { GraphQLClient, clearGraphQLClientCache } from '../utils/graphqlClient.js';
import { resolveAuth, clearAuthCache } from '../utils/authSession.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/* ============================================================================
 * 交互式输入辅助函数
 * ============================================================================ */

/**
 * 通用交互式输入函数
 *
 * 提示用户输入内容，支持可见和隐藏两种模式
 *
 * @param prompt - 提示文本
 * @param hidden - 是否隐藏输入（密码模式）
 * @returns 用户输入的字符串
 *
 * @example
 * const name = await ask('请输入名称: ');
 * const password = await ask('请输入密码: ', true);
 */
function ask(prompt: string, hidden = false): Promise<string> {
	if (hidden && process.stdin.isTTY) {
		return readHidden(prompt);
	}
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stderr,
			terminal: process.stdin.isTTY ?? false
		});
		rl.question(prompt, (answer) => {
			rl.close();
			resolve((answer || '').trim());
		});
	});
}

/**
 * 隐藏输入实现（TTY 模式下的密码输入）
 *
 * 使用原始模式捕获键盘输入，支持退格和 Ctrl+C 取消
 *
 * @param prompt - 提示文本
 * @returns 用户输入的字符串
 * @throws 用户按 Ctrl+C 时抛出错误
 */
function readHidden(prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		process.stderr.write(prompt);
		const buf: string[] = [];
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf8');
		const onData = (ch: string) => {
			switch (ch) {
				case '\r':
				case '\n':
					cleanup();
					process.stderr.write('\n');
					resolve(buf.join(''));
					break;
				case '\u0003': // Ctrl+C
					cleanup();
					process.stderr.write('\n');
					reject(new Error('已取消'));
					break;
				case '\u007F':
				case '\b': // 退格
					buf.pop();
					break;
				default:
					buf.push(ch);
			}
		};
		const cleanup = () => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
		};
		process.stdin.on('data', onData);
	});
}

/* ============================================================================
 * GraphQL 请求辅助函数
 * ============================================================================ */

/**
 * 执行 GraphQL 请求（用于登录阶段）
 *
 * 使用会话 Cookie 认证
 *
 * @param baseUrl - Affine 服务器基础 URL
 * @param cookie - 会话 Cookie
 * @param query - GraphQL 查询字符串
 * @param variables - 可选的变量对象
 * @returns 解析后的响应数据
 * @throws 网络错误、超时、GraphQL 错误
 */
async function gql(
	baseUrl: string,
	cookie: string,
	query: string,
	variables?: Record<string, any>
): Promise<any> {
	const client = new GraphQLClient(`${baseUrl}/graphql`, { Cookie: cookie });
	return await client.request(query, variables);
}

/**
 * 检查连接并获取用户信息
 *
 * 通过 GraphQL 查询验证会话是否有效，获取当前用户信息
 *
 * @param baseUrl - Affine 服务器基础 URL
 * @param cookie - 会话 Cookie
 * @returns 用户信息对象 { userName, userEmail, workspaceCount }
 * @throws 认证失败
 */
async function inspectConnection(
	baseUrl: string,
	cookie: string
): Promise<{ userName: string; userEmail: string; workspaceCount: number }> {
	const data = await gql(
		baseUrl,
		cookie,
		'query { currentUser { name email } workspaces { id } }'
	);
	return {
		userName: data.currentUser.name,
		userEmail: data.currentUser.email,
		workspaceCount: data.workspaces.length
	};
}

/**
 * 检测并选择工作区
 *
 * 如果指定了首选工作区 ID 则直接使用，否则列出所有工作区供用户选择
 *
 * @param baseUrl - Affine 服务器基础 URL
 * @param cookie - 会话 Cookie
 * @param preferredWorkspaceId - 首选工作区 ID（可选）
 * @returns 选择的工作区 ID
 * @throws 没有可用工作区或选择无效
 */
async function detectWorkspace(
	baseUrl: string,
	cookie: string,
	preferredWorkspaceId?: string,
	interactive: boolean = process.stdin.isTTY === true
): Promise<string> {
	if (preferredWorkspaceId) {
		console.error(`使用指定的工作区: ${preferredWorkspaceId}`);
		return preferredWorkspaceId;
	}

	console.error('检测工作区...');
	const data = await gql(baseUrl, cookie, `query {workspaces {id createdAt}}`);

	const workspaces: any[] = data.workspaces;
	if (workspaces.length === 0) {
		console.error('  未找到工作区');
		throw new Error('没有可用工作区，请先创建工作区');
	}

	const formatWs = (w: any) => {
		const date = w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '';
		return `${w.id}  (${date})`;
	};

	if (workspaces.length === 1) {
		console.error(`  找到 1 个工作区: ${formatWs(workspaces[0])}`);
		console.error('  自动选择');
		return workspaces[0].id;
	}

	if (!interactive) {
		throw new Error(
			`检测到 ${workspaces.length} 个工作区，非交互模式无法选择。` +
				'请通过 --workspace 参数或 AFFINE_WORKSPACE_ID 环境变量指定工作区 ID'
		);
	}

	console.error(`  找到 ${workspaces.length} 个工作区:`);
	workspaces.forEach((w, i) => console.error(`    ${i + 1}) ${formatWs(w)}`));
	const choice = (await ask(`\n选择 [1]: `)) || '1';
	const idx = parseInt(choice, 10) - 1;
	if (idx < 0 || idx >= workspaces.length) {
		throw new Error('无效的选择');
	}
	return workspaces[idx].id;
}

/* ============================================================================
 * 登录处理器
 * ============================================================================ */

/**
 * 登录处理器
 *
 * 主登录入口，使用邮箱/密码登录并保存会话 Cookie。
 * 若已通过 AFFINE_EMAIL + AFFINE_PASSWORD 环境变量提供凭据，则跳过交互输入。
 *
 * 配置保存位置：
 * - --local: 当前目录 .env
 * - 默认: ~/.affine-cli/affine-cli.env
 *
 * @param params - 参数对象
 * @param params.url - Affine 服务器 URL（默认 https://app.affine.pro）
 * @param params.workspaceId - 首选工作区 ID（可选）
 * @param params.local - 是否保存到本地配置
 * @param params.force - 是否强制覆盖现有配置
 * @returns 登录结果 { success, message, baseUrl, workspaceId }
 *
 * @example
 * await authLoginHandler({ url: 'https://your-affine.example.com' });
 */
export async function authLoginHandler(params: {
	url?: string;
	workspaceId?: string;
	local?: boolean;
	force?: boolean;
}): Promise<any> {
	console.error('Affine Skill CLI — 登录 (邮箱/密码 → 会话 Cookie)\n');

	const configFile = params.local
		? path.join(process.cwd(), '.env')
		: path.join(os.homedir(), '.affine-cli', 'affine-cli.env');

	const isInteractive = process.stdin.isTTY === true;

	const existing = loadConfigFile();
	if (existing.AFFINE_COOKIE && !params.force) {
		console.error(`现有配置: ${configFile}`);
		console.error(`  URL:   ${existing.AFFINE_BASE_URL || '(默认)'}`);
		console.error('  Cookie: (已设置)');
		console.error(`  工作区: ${existing.AFFINE_WORKSPACE_ID || '(无)'}\n`);
		if (isInteractive) {
			const overwrite = await ask('是否覆盖? [y/N] ');
			if (!/^[yY]$/.test(overwrite)) {
				console.error('保留现有配置');
				return { success: false, message: '已取消' };
			}
		} else {
			console.error('非交互模式：直接覆盖现有配置');
		}
		console.error('');
	}

	if (existing.AFFINE_API_TOKEN) {
		console.error(
			'提示: 检测到旧的 AFFINE_API_TOKEN。AFFiNE 0.27+ 已不再支持 Personal Access Token，该配置将被忽略。\n'
		);
	}

	// URL 解析：参数 > 环境变量 > 交互提示 > 默认值（非交互时不阻塞）
	const defaultUrl = existing.AFFINE_BASE_URL || 'https://app.affine.pro';
	let rawUrl: string;
	if (params.url) {
		rawUrl = params.url;
	} else if (process.env.AFFINE_BASE_URL) {
		rawUrl = process.env.AFFINE_BASE_URL;
	} else if (isInteractive) {
		rawUrl = (await ask(`Affine URL [${defaultUrl}]: `)) || defaultUrl;
	} else {
		rawUrl = defaultUrl;
	}
	const baseUrl = validateBaseUrl(rawUrl);

	// 凭据来源：环境变量优先，否则交互式输入（非交互且缺失时报错而非阻塞）
	const envEmail = process.env.AFFINE_EMAIL;
	const envPassword = process.env.AFFINE_PASSWORD;
	let email: string;
	let password: string;
	if (envEmail && envPassword) {
		email = envEmail;
		password = envPassword;
		console.error('使用 AFFINE_EMAIL / AFFINE_PASSWORD 环境变量登录...');
	} else if (isInteractive) {
		email = await ask('邮箱: ');
		password = await ask('密码: ', true);
	} else {
		throw new Error(
			'非交互模式登录需要提供凭据。请设置 AFFINE_EMAIL 与 AFFINE_PASSWORD 环境变量'
		);
	}
	if (!email || !password) {
		throw new Error('邮箱和密码不能为空');
	}

	console.error('正在登录...');
	let cookieHeader: string;
	try {
		({ cookieHeader } = await loginWithPassword(baseUrl, email, password));
	} catch (err: any) {
		throw new Error(`登录失败: ${err.message}`);
	}

	try {
		const data = await gql(baseUrl, cookieHeader, 'query { currentUser { name email } }');
		console.error(`✓ 已登录为: ${data.currentUser.name} <${data.currentUser.email}>\n`);
	} catch (err: any) {
		throw new Error(`会话验证失败: ${err.message}`);
	}

	const workspaceId = await detectWorkspace(
		baseUrl,
		cookieHeader,
		params.workspaceId || process.env.AFFINE_WORKSPACE_ID,
		isInteractive
	);

	writeConfigFile(
		{
			AFFINE_BASE_URL: baseUrl,
			AFFINE_COOKIE: cookieHeader,
			AFFINE_WORKSPACE_ID: workspaceId
		},
		params.local
	);

	// 清除进程内缓存，确保后续请求使用最新凭据
	clearConfigCache();
	clearAuthCache();
	clearGraphQLClientCache();

	console.error(`\n✓ 已保存到 ${configFile}`);
	return {
		success: true,
		message: '登录成功',
		baseUrl,
		workspaceId
	};
}

/**
 * 登出处理器
 *
 * 删除配置文件，支持本地和全局配置
 *
 * @param params - 参数对象
 * @param params.local - 是否删除本地配置（默认删除全局配置）
 * @returns 登出结果 { success, message }
 *
 * @example
 * // 退出全局登录
 * await authLogoutHandler({});
 *
 * // 退出本地登录
 * await authLogoutHandler({ local: true });
 */
export async function authLogoutHandler(params: { local?: boolean }): Promise<any> {
	const configFile = params.local ? process.cwd() + '/.env' : GLOBAL_CONFIG_FILE;
	clearConfigCache();
	clearAuthCache();
	clearGraphQLClientCache();
	if (fs.existsSync(configFile)) {
		fs.unlinkSync(configFile);
		console.error(`已移除 ${configFile}`);
		return { success: true, message: '已登出' };
	} else {
		console.error('未找到配置文件');
		return { success: false, message: '未找到配置文件' };
	}
}

/**
 * 状态查询处理器
 *
 * 检查当前登录状态，显示用户信息和配置详情
 *
 * @param params - 参数对象
 * @param params.json - 是否以 JSON 格式输出（默认 false）
 * @returns 状态信息对象，包含配置详情和用户信息
 * @throws 未登录、连接失败
 *
 * @example
 * await authStatusHandler({});
 * await authStatusHandler({ json: true });
 */
export async function authStatusHandler(params: { json?: boolean }): Promise<any> {
	const config = loadConfig();
	const auth = await resolveAuth();
	if (auth.kind !== 'cookie') {
		throw new Error(
			'未登录。请运行: affine-cli auth login，或设置 AFFINE_COOKIE / AFFINE_EMAIL+AFFINE_PASSWORD 环境变量'
		);
	}

	const source = config.cookie ? 'cookie' : 'email-password';
	const cookieHint = config.cookie ? redactSecret(config.cookie) : '(来自邮箱/密码自动登录)';

	try {
		const inspection = await inspectConnection(config.baseUrl, auth.cookie);

		if (params.json) {
			return {
				configFile: GLOBAL_CONFIG_FILE,
				baseUrl: config.baseUrl,
				workspaceId: config.defaultWorkspaceId || null,
				authSource: source,
				cookie: cookieHint,
				userName: inspection.userName,
				userEmail: inspection.userEmail,
				workspaceCount: inspection.workspaceCount
			};
		}

		console.error(`全局配置: ${GLOBAL_CONFIG_FILE}`);
		console.error(`URL:       ${config.baseUrl}`);
		console.error(`认证来源:  ${source}`);
		console.error(`Cookie:    ${cookieHint}`);
		console.error(`工作区: ${config.defaultWorkspaceId || '(无)'}\n`);
		console.error(`用户: ${inspection.userName} <${inspection.userEmail}>`);
		console.error(`工作区数量: ${inspection.workspaceCount}`);

		return {
			success: true,
			authSource: source,
			userName: inspection.userName,
			userEmail: inspection.userEmail,
			workspaceCount: inspection.workspaceCount
		};
	} catch (err: any) {
		throw new Error(`连接失败: ${err.message}`);
	}
}
