/**
 * 文件附件核心模块
 * 处理文件上传、删除、清理等操作
 *
 * 支持的功能：
 * 1. 上传文件/内容到工作区作为附件
 * 2. 删除指定附件（支持软删除和永久删除）
 * 3. 清理已标记为删除的附件，释放存储空间
 */

import { createGraphQLClient } from '../utils/graphqlClient.js';
import { getWorkspaceId, loadConfig } from '../utils/config.js';
import { generateId } from '../utils/misc.js';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

/* ============================================================================
 * 辅助函数
 * ============================================================================ */

/**
 * 解码 Blob 内容
 *
 * 自动识别输入内容是 Base64 编码还是普通文本
 * 如果看起来像 Base64 则解码，否则直接作为文本处理
 *
 * @param content - 输入内容字符串
 * @returns 解码后的 Buffer
 *
 * @example
 * const buf = decodeBlobContent('SGVsbG8gV29ybGQ='); // Base64 "Hello World"
 * const buf2 = decodeBlobContent('Hello World');     // 直接文本
 */
function decodeBlobContent(content: string): Buffer {
	const normalized = content.trim().replace(/\s+/g, '');
	const base64Like =
		normalized.length > 0 &&
		normalized.length % 4 === 0 &&
		/^[A-Za-z0-9+/=]+$/.test(normalized);
	if (base64Like) {
		try {
			const decoded = Buffer.from(normalized, 'base64');
			if (decoded.length > 0) {
				return decoded;
			}
		} catch {
			// 回退到 UTF-8 文本
		}
	}
	return Buffer.from(content, 'utf8');
}

/* ============================================================================
 * 公共接口
 * ============================================================================ */

/**
 * 上传附件处理器
 *
 * 将文件或内容上传到工作区作为附件
 * 支持两种方式：
 * 1. --file: 从文件系统读取文件
 * 2. --content: 直接传入 Base64 编码或文本内容
 *
 * @param params - 参数对象
 * @param params.file - 文件路径（优先使用）
 * @param params.content - Base64 编码内容或文本内容
 * @param params.filename - 自定义文件名（可选）
 * @param params.contentType - MIME 类型（可选，默认 application/octet-stream）
 * @param params.workspace - 工作区 ID（可选，默认使用配置中的工作区）
 * @returns 上传结果，包含：
 *   - success: 是否成功
 *   - data: { id, key, workspaceId, filename, contentType, size, downloadUrl, uploadedAt }
 *
 * @throws 文件不存在、缺少参数、上传失败等错误
 *
 * @example
 * // 上传文件
 * await fileUploadHandler({ file: '/path/to/image.png' });
 *
 * // 上传 Base64 内容
 * await fileUploadHandler({ content: 'base64...', filename: 'doc.pdf' });
 *
 * // 上传文本内容
 * await fileUploadHandler({ content: 'Hello World', filename: 'hello.txt', contentType: 'text/plain' });
 */
export async function fileUploadHandler(params: {
	file?: string;
	content?: string;
	filename?: string;
	contentType?: string;
	workspace?: string;
}): Promise<any> {
	const gql = await createGraphQLClient();
	const workspaceId = getWorkspaceId(params.workspace);

	let content: string;
	let filename: string;

	if (params.file) {
		if (!fs.existsSync(params.file)) {
			throw new Error(`文件不存在: ${params.file}`);
		}
		content = fs.readFileSync(params.file).toString('base64');
		filename = params.filename || path.basename(params.file);
	} else if (params.content) {
		content = params.content;
		filename = params.filename || '-content';
	} else {
		throw new Error('必须提供 --file 或 --content 参数');
	}

	const payload = decodeBlobContent(content);
	const uniqueId = generateId(12, 'file');
	const safeFilename = `${uniqueId}-${filename}`;
	const mime = params.contentType || 'application/octet-stream';

	const form = new FormData();
	form.append(
		'operations',
		JSON.stringify({
			query: `mutation SetBlob($workspaceId: String!, $blob: Upload!) {
        setBlob(workspaceId: $workspaceId, blob: $blob)
      }`,
			variables: {
				workspaceId,
				blob: null
			}
		})
	);
	form.append('map', JSON.stringify({ '0': ['variables.blob'] }));
	form.append('0', payload, { filename: safeFilename, contentType: mime });

	const endpoint = gql.endpoint;
	const headers = gql.buildHeaders();

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			...headers,
			...form.getHeaders()
		},
		body: form as any
	});

	const result = (await response.json()) as any;
	if (result.errors?.length) {
		throw new Error(result.errors[0].message);
	}
	const blobKey = result.data?.setBlob;

	if (!blobKey) {
		throw new Error('Upload succeeded but no blob key was returned.');
	}

	const config = loadConfig();
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const downloadUrl = `${baseUrl}/api/workspaces/${workspaceId}/blobs/${blobKey}`;

	return {
		success: true,
		data: {
			id: blobKey,
			// key: blobKey,
			// workspaceId,
			filename: safeFilename,
			contentType: mime,
			size: payload.length,
			downloadUrl
			// uploadedAt: new Date().toISOString()
		}
	};
}

/**
 * 删除附件处理器
 *
 * 删除指定的附件，支持软删除（默认）和永久删除
 * 软删除仅标记为已删除，可通过 clean 命令清理
 *
 * @param params - 参数对象
 * @param params.id - 要删除的附件 ID（Blob key）
 * @param params.permanently - 是否永久删除（默认 false）
 * @param params.workspace - 工作区 ID（可选）
 * @returns 删除结果 { success, message }
 *
 * @throws 删除失败等错误
 *
 * @example
 * // 软删除（可恢复）
 * await fileDeleteHandler({ id: 'blob123' });
 *
 * // 永久删除
 * await fileDeleteHandler({ id: 'blob123', permanently: true });
 */
export async function fileDeleteHandler(params: {
	id: string;
	permanently?: boolean;
	workspace?: string;
}): Promise<any> {
	const gql = await createGraphQLClient();
	const workspaceId = getWorkspaceId(params.workspace);

	const mutation = `mutation DeleteBlob($workspaceId: String!, $key: String!, $permanently: Boolean) {
    deleteBlob(workspaceId: $workspaceId, key: $key, permanently: $permanently)
  }`;

	await gql.request<any>(mutation, {
		workspaceId,
		key: params.id,
		permanently: params.permanently || false
	});

	return {
		success: true,
		message: `附件 ${params.id} 已${params.permanently ? '永久' : ''}删除`
	};
}

/**
 * 清理已删除的附件处理器
 *
 * 清理所有已标记为删除的附件，释放存储空间
 * 此操作不可恢复
 *
 * @param params - 参数对象
 * @param params.workspace - 工作区 ID（可选）
 * @returns 清理结果 { success, blobsReleased, message }
 *
 * @example
 * await fileCleanHandler({ workspace: 'ws123' });
 */
export async function fileCleanHandler(params: { workspace?: string }): Promise<any> {
	const gql = await createGraphQLClient();
	const workspaceId = getWorkspaceId(params.workspace);

	const mutation = `mutation ReleaseDeletedBlobs($workspaceId: String!) {
    releaseDeletedBlobs(workspaceId: $workspaceId)
  }`;

	const data = await gql.request<any>(mutation, { workspaceId });

	return {
		success: true,
		blobsReleased: data.releaseDeletedBlobs,
		message: `已清理已删除的附件`
	};
}
