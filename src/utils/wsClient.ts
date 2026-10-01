/**
 * 模块名称：wsClient.ts
 * WebSocket 客户端模块
 *
 * 功能描述：
 * - 提供与 Affine WebSocket 服务交互的功能
 * - 用于读取和写入 Y.js CRDT 状态
 * - 支持文档的加载、更新、删除操作
 * - 支持工作区元数据提取（页面信息、标签选项）
 *
 * 导出的函数：
 * - wsUrlFromGraphQLEndpoint: 从 GraphQL URL 推导 WebSocket URL
 * - createWorkspaceSocket: 连接工作区 WebSocket
 * - joinWorkspace: 加入工作区
 * - loadDoc: 加载文档快照
 * - pushDocUpdate: 推送文档更新
 * - deleteDoc: 删除文档
 * - extractWorkspacePages: 提取页面元数据
 * - extractTagNames: 提取标签名称
 * - getWorkspaceDocs: 获取工作区文档信息
 */

import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { getApiConfig } from './config.js';
import { resolveAuth } from './authSession.js';
import { getAffineClientVersion } from './version.js';
import { getWorkspaceTagOptions } from '../core/tags.js';

const WS_CONNECT_TIMEOUT_MS = 10000;
const WS_ACK_TIMEOUT_MS = 10000;

let _sharedSocket: Socket | null = null;
let _sharedSocketPromise: Promise<Socket> | null = null;
const _joinedWorkspaces = new Set<string>();

export function closeWorkspaceSocket() {
	if (_sharedSocket) {
		_sharedSocket.disconnect();
		_sharedSocket = null;
	}
	_sharedSocketPromise = null;
	_joinedWorkspaces.clear();
}

/**
 * wsUrlFromGraphQLEndpoint: 从 GraphQL 端点 URL 推导 WebSocket URL
 *
 * @param endpoint - GraphQL 端点 URL（如 https://app.affine.pro/graphql）
 * @returns WebSocket URL（如 wss://app.affine.pro）
 *
 * 转换规则：
 * - https:// → wss://
 * - http:// → ws://
 * - 移除末尾的 /graphql
 */
export function wsUrlFromGraphQLEndpoint(endpoint: string): string {
	return endpoint
		.replace('https://', 'wss://')
		.replace('http://', 'ws://')
		.replace(/\/graphql\/?$/, '');
}

/**
 * createWorkspaceSocket: 连接工作区 WebSocket
 *
 * @returns Socket.io 连接对象
 * @throws 连接超时、连接失败或未配置认证
 *
 * 注意事项：
 * - 使用 websocket 传输
 * - 默认超时 10 秒
 * - 通过 resolveAuth() 获取会话 Cookie 并注入握手头
 */
export async function createWorkspaceSocket(): Promise<Socket> {
	if (_sharedSocket && _sharedSocket.connected) {
		return _sharedSocket;
	}
	if (_sharedSocketPromise) {
		return _sharedSocketPromise;
	}

	const { apiUrl } = getApiConfig();
	const auth = await resolveAuth();

	const extraHeaders: Record<string, string> = {};
	if (auth.kind === 'cookie') extraHeaders['Cookie'] = auth.cookie;

	const url = wsUrlFromGraphQLEndpoint(apiUrl);
	const socket = io(url, {
		transports: ['websocket'],
		path: '/socket.io/',
		extraHeaders: Object.keys(extraHeaders).length ? extraHeaders : undefined,
		autoConnect: true,
		timeout: WS_CONNECT_TIMEOUT_MS
	});

	_sharedSocketPromise = new Promise((resolve, reject) => {
		const onConnect = () => {
			socket.off('connect_error', onError);
			resolve(socket);
		};

		const onError = (err: any) => {
			socket.off('connect', onConnect);
			socket.disconnect();
			_sharedSocketPromise = null;
			reject(err);
		};

		socket.on('connect', onConnect);
		socket.on('connect_error', onError);

		// 如果配置了超时但未连接，socket.io-client 会自动触发 connect_error
		// 超时错误信息会是 "timeout"
		setTimeout(() => {
			if (!socket.connected) {
				socket.off('connect', onConnect);
				socket.off('connect_error', onError);
				socket.disconnect();
				_sharedSocketPromise = null;
				reject(new Error(`WebSocket 连接超时 (${WS_CONNECT_TIMEOUT_MS}ms)`));
			}
		}, WS_CONNECT_TIMEOUT_MS + 1000);
	});

	try {
		_sharedSocket = await _sharedSocketPromise;
		return _sharedSocket;
	} catch (err) {
		throw err;
	}
}

/**
 * joinWorkspace: 加入工作区
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @returns 加入成功时 resolve，超时或失败时 reject
 * @throws 加入工作区超时
 */
export async function joinWorkspace(socket: Socket, workspaceId: string) {
	if (_joinedWorkspaces.has(workspaceId)) return;
	try {
		const ack = await socket.timeout(WS_ACK_TIMEOUT_MS).emitWithAck('space:join', {
			spaceType: 'workspace',
			spaceId: workspaceId,
			clientVersion: getAffineClientVersion()
		});

		if (ack?.error) {
			throw new Error(ack.error.message || '加入工作区失败');
		}
		_joinedWorkspaces.add(workspaceId);
	} catch (err: any) {
		if (err.message?.includes('timeout')) {
			throw new Error(`加入工作区超时 (${WS_ACK_TIMEOUT_MS}ms)`);
		}
		throw err;
	}
}

/**
 * loadDoc: 加载文档快照
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @param docId - 文档 ID
 * @returns 包含 missing（Base64 编码的 Y.js 更新数据）或 state 的对象
 * @throws 加载文档超时
 *
 * 返回对象：
 * - missing: Base64 编码的 Y.js 更新数据（新增内容）
 * - state: Base64 编码的完整 Y.js 状态
 * - timestamp: 更新时间戳
 */
export async function loadDoc(
	socket: Socket,
	workspaceId: string,
	docId: string
): Promise<{ missing?: string; state?: string; timestamp?: number }> {
	try {
		const ack = await socket.timeout(WS_ACK_TIMEOUT_MS).emitWithAck('space:load-doc', {
			spaceType: 'workspace',
			spaceId: workspaceId,
			docId
		});

		if (ack?.error) {
			if (ack.error.name === 'DOC_NOT_FOUND') {
				return {};
			}
			throw new Error(ack.error.message || '加载文档失败');
		}

		return ack?.data || {};
	} catch (err: any) {
		if (err.message?.includes('timeout')) {
			throw new Error(`加载文档超时 (${WS_ACK_TIMEOUT_MS}ms)`);
		}
		throw err;
	}
}

/**
 * pushDocUpdate: 推送文档更新
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @param docId - 文档 ID
 * @param updateBase64 - Base64 编码的 Y.js 更新数据
 * @returns 更新时间戳
 * @throws 推送更新超时
 */
export async function pushDocUpdate(
	socket: Socket,
	workspaceId: string,
	docId: string,
	updateBase64: string
): Promise<number> {
	try {
		const ack = await socket.timeout(WS_ACK_TIMEOUT_MS).emitWithAck('space:push-doc-update', {
			spaceType: 'workspace',
			spaceId: workspaceId,
			docId,
			update: updateBase64
		});

		if (ack?.error) {
			throw new Error(ack.error.message || '推送更新失败');
		}

		return ack?.data?.timestamp || Date.now();
	} catch (err: any) {
		if (err.message?.includes('timeout')) {
			throw new Error(`推送更新超时 (${WS_ACK_TIMEOUT_MS}ms)`);
		}
		throw err;
	}
}

/**
 * deleteDoc: 删除文档
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @param docId - 文档 ID
 *
 * 注意事项：
 * - 这是单向操作，不等待响应
 */
export function deleteDoc(socket: Socket, workspaceId: string, docId: string): void {
	socket.emit('space:delete-doc', { spaceType: 'workspace', spaceId: workspaceId, docId });
}

/**
 * extractWorkspacePages: 从 Y.js 工作区文档中提取页面元数据
 *
 * @param wsDoc - Y.Doc 工作区文档
 * @returns 页面数组，包含 id、title、tagsArray、createDate、updateDate
 *
 * 注意事项：
 * - 从 meta.pages 中提取页面信息
 */
export function extractWorkspacePages(wsDoc: Y.Doc) {
	const meta = wsDoc.getMap('meta');
	const pages = meta.get('pages') as Y.Array<Y.Map<any>> | undefined;
	if (!pages) return [];
	return pages.toArray().map((page) => ({
		id: page.get('id'),
		title: page.get('title'),
		tagsArray: page.get('tags'),
		createDate: page.get('createDate'),
		updateDate: page.get('updateDate')
	}));
}

/**
 * extractTagNames: 从 Y.Array 中提取标签名称数组
 *
 * @param tagsArray - 标签 ID 的 Y.Array
 * @param tagOptions - 标签选项数组（id 到 value 的映射）
 * @returns 标签名称数组
 *
 * 注意事项：
 * - 使用 tagOptions 将标签 ID 转换为名称
 * - 只返回能找到对应名称的标签
 */
export function extractTagNames(
	tagsArray: any,
	tagOptions: Array<{ id: string; value: string }>
): string[] {
	if (!tagsArray || !(tagsArray instanceof Y.Array)) {
		return [];
	}
	const byId = new Map<string, string>();
	for (const opt of tagOptions) {
		byId.set(opt.id, opt.value);
	}
	const names: string[] = [];
	tagsArray.forEach((tagId: string) => {
		const tagName = byId.get(tagId);
		if (tagName) {
			names.push(tagName);
		}
	});
	return names;
}

/**
 * getWorkspaceDocs: 获取工作区文档信息
 *
 * 功能描述：
 * - 通过 WebSocket 加载工作区文档
 * - 提取所有页面的标题和标签信息
 * - 返回 Map<docId, { title, tags, createDate, updateDate }>
 *
 * @param workspaceId - 工作区 ID
 * @returns 文档信息 Map
 */
export async function getWorkspaceDocs(workspaceId: string) {
	const socket = await createWorkspaceSocket();

	try {
		await joinWorkspace(socket, workspaceId);
		const { doc } = await fetchYDoc(socket, workspaceId, workspaceId);

		const meta = doc.getMap('meta');
		const tagOptions = getWorkspaceTagOptions(meta);
		const pages = extractWorkspacePages(doc);
		const pagesInfo = new Map<
			string,
			{ title: string; tags: string[]; createDate?: string; updateDate?: string }
		>();
		for (const page of pages) {
			if (page.id) {
				const tagNames = extractTagNames(page.tagsArray, tagOptions);
				pagesInfo.set(page.id, {
					title: page.title || '',
					tags: tagNames,
					createDate: page.createDate,
					updateDate: page.updateDate
				});
			}
		}
		return pagesInfo;
	} finally {
	}
}

/**
 * fetchYDoc: 加载文档快照并初始化 Y.Doc
 *
 * 功能描述：
 * - 从服务器加载指定文档的快照数据
 * - 创建并初始化 Y.Doc 实例
 * - 计算并返回初始的状态向量，用于后续增量更新
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @param docId - 文档 ID
 * @returns 包含 Y.Doc 实例 (doc)、是否已存在快照 (exists)、以及初始的状态向量 (prevSV)
 */
export async function fetchYDoc(
	socket: Socket,
	workspaceId: string,
	docId: string
): Promise<{ doc: Y.Doc; exists: boolean; prevSV: Uint8Array }> {
	const snapshot = await loadDoc(socket, workspaceId, docId);
	const doc = new Y.Doc();
	const exists = !!snapshot.missing;
	if (snapshot.missing) {
		Y.applyUpdate(doc, Buffer.from(snapshot.missing, 'base64'));
	}
	const prevSV = Y.encodeStateVector(doc);
	return { doc, exists, prevSV };
}

/**
 * updateYDoc: 推送 Y.Doc 的更新到服务器
 *
 * 功能描述：
 * - 根据前一个状态向量 (prevSV) 计算 Y.Doc 的增量更新
 * - 将增量更新转换为 Base64 格式并推送到服务器
 *
 * @param socket - WebSocket 连接对象
 * @param workspaceId - 工作区 ID
 * @param docId - 文档 ID
 * @param doc - Y.Doc 实例
 * @param prevSV - 前一个状态向量，用于计算增量
 * @returns 更新时间戳
 */
export async function updateYDoc(
	socket: Socket,
	workspaceId: string,
	docId: string,
	doc: Y.Doc,
	prevSV?: Uint8Array
): Promise<number> {
	const update = prevSV ? Y.encodeStateAsUpdate(doc, prevSV) : Y.encodeStateAsUpdate(doc);
	return pushDocUpdate(socket, workspaceId, docId, Buffer.from(update).toString('base64'));
}

/**
 * getSpecialWorkspaceDocId: 生成工作区特殊文档 ID
 *
 * 功能描述：
 * - Affine 使用特殊的文档 ID 格式来存储工作区的附加数据
 * - 格式：db${workspaceId}${tableName}
 *
 * @param workspaceId - 工作区 ID
 * @param tableName - 表名（如 'folders'）
 * @returns 特殊文档 ID 字符串
 */
export function getSpecialWorkspaceDocId(workspaceId: string, tableName: string): string {
	return `db$${workspaceId}$${tableName}`;
}
