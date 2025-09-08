import * as vscode from 'vscode';
import * as path from 'path';

type Lang = string;

interface DocInfo {
	lang: Lang;
	relPathWithExt: string;    // e.g. articles/intro/get-started.md
	relPathNoExt: string;      // e.g. articles/intro/get-started
	staticDir: string;         // typically "static"
}

// Normalize to posix-like path (useful on Windows)
function toPosix(p: string): string {
	return p.replace(/\\/g, '/');
}

// Find "<workspace>/static/<lang>/<...>.md" segments from a file Uri
function parseDocInfo(uri: vscode.Uri, languages: Lang[], staticDir: string, treatReadmeAsIndex: boolean): DocInfo | null {
	const fsPathPosix = toPosix(uri.fsPath);
	const parts = fsPathPosix.split('/');
	// Find "static" segment
	const staticIdx = parts.lastIndexOf(staticDir);
	if (staticIdx < 0) return null;

	const lang = parts[staticIdx + 1];
	if (!languages.includes(lang)) return null;

	const relParts = parts.slice(staticIdx + 2); // after <static>/<lang>/
	if (relParts.length === 0) return null;

	const relPathWithExt = relParts.join('/'); // includes ".md"
	const ext = path.posix.extname(relPathWithExt);
	const noExt = relPathWithExt.slice(0, relPathWithExt.length - ext.length);
	const relPathNoExt = (treatReadmeAsIndex && noExt.endsWith('/README'))
		? noExt.replace(/\/README$/, '')
		: noExt;

	return {
		lang,
		relPathWithExt,
		relPathNoExt,
		staticDir
	};
}

// Build target file Uri: "<workspace>/static/<targetLang>/<relPathWithExt>"
async function buildTargetFileUri(sourceUri: vscode.Uri, targetLang: Lang, info: DocInfo): Promise<vscode.Uri> {
	// ascend to workspace root from sourceUri by removing ".../<static>/<lang>/<relPathWithExt>"
	const fsPathPosix = toPosix(sourceUri.fsPath);
	const needle = `/${info.staticDir}/${info.lang}/${info.relPathWithExt}`;
	const idx = fsPathPosix.lastIndexOf(needle);
	if (idx < 0) {
		throw new Error('无法从源文件路径定位文档根目录。');
	}
	const root = fsPathPosix.slice(0, idx);
	const targetPosix = `${root}/${info.staticDir}/${targetLang}/${info.relPathWithExt}`;
	return vscode.Uri.file(targetPosix);
}

// Ensure directory exists then create file with template
async function ensureCreateFile(target: vscode.Uri, template: string) {
	const dirname = vscode.Uri.file(path.dirname(target.fsPath));
	await vscode.workspace.fs.createDirectory(dirname);

	// Simple template placeholder
	const baseName = path.basename(target.fsPath, path.extname(target.fsPath));
	const content = template.replace(/\$\{BASENAME\}/g, baseName);
	await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

// Open a file in editor; create if missing (with prompt)
async function openFileWithCreatePrompt(target: vscode.Uri, template: string) {
	if (!(await exists(target))) {
		const pick = await vscode.window.showInformationMessage(
			`文件不存在：${target.fsPath}\n是否创建？`,
			{ modal: true },
			'创建', '取消'
		);
		if (pick !== '创建') return;
		await ensureCreateFile(target, template);
	}
	const doc = await vscode.workspace.openTextDocument(target);
	await vscode.window.showTextDocument(doc, { preview: false });
}

// Build URL for a doc
function buildUrl(base: string, lang: Lang, relPathNoExt: string): vscode.Uri {
	const baseTrim = base.replace(/\/+$/, '');
	const pathPart = relPathNoExt.replace(/^\/+/, '');
	return vscode.Uri.parse(`${baseTrim}/${lang}/${pathPart}`);
}

// Pick a workspace folder that looks like docs root when opening from URL
async function pickDocsWorkspace(staticDir: string, languages: Lang[], preferredName: string | undefined): Promise<vscode.WorkspaceFolder | null> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) return null;

	// 1) prefer by name
	if (preferredName) {
		const found = folders.find(f => f.name === preferredName);
		if (found) return found;
	}
	// 2) heuristic: contains static/<oneLang>
	for (const f of folders) {
		const probe = vscode.Uri.joinPath(f.uri, staticDir, languages[0]);
		if (await exists(probe)) return f;
	}
	// 3) fallback: first
	return folders[0];
}

// From URL string -> (lang, relPathWithExt)
function parseUrlToLangAndRel(urlStr: string, languages: Lang[]): { lang: Lang; relNoExt: string } | null {
	try {
		const u = new URL(urlStr);
		// pathname like "/zh_CN/foo/bar"
		const segs = u.pathname.split('/').filter(Boolean);
		if (segs.length < 2) return null;
		const lang = segs[0];
		if (!languages.includes(lang)) return null;
		const relNoExt = segs.slice(1).join('/'); // no .md in URL
		return { lang, relNoExt };
	} catch {
		return null;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const cfg = vscode.workspace.getConfiguration('m5docs');
	const languages = cfg.get<Lang[]>('languages', ['zh_CN', 'en', 'ja']);
	const staticDir = cfg.get<string>('staticDirName', 'static');
	const onlineBase = cfg.get<string>('onlineBaseUrl', 'https://docs.m5stack.com');
	const previewBase = cfg.get<string>('previewBaseUrl', 'http://127.0.0.1:3000');
	const createTemplate = cfg.get<string>('createTemplate', '# ${BASENAME}\n\n> TODO: 内容待补充。');
	const treatReadmeAsIndex = cfg.get<boolean>('treatReadmeAsIndex', true);
	const docsRootName = cfg.get<string>('docsRootName', 'nuxt-m5-docs');

	function registerOpenSiblingCommand(targetLang: Lang) {
		const disposable = vscode.commands.registerCommand(`m5docs.openSibling.${targetLang}`, async (uri?: vscode.Uri) => {
			const source = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!source) {
				vscode.window.showErrorMessage('未获取到源文件。请从 .md 文件右键或激活编辑器后执行命令。');
				return;
			}
			const info = parseDocInfo(source, languages, staticDir, treatReadmeAsIndex);
			if (!info) {
				vscode.window.showErrorMessage(`该文件不在 ${staticDir}/{${languages.join(',')}}/ 结构内。`);
				return;
			}
			try {
				const target = await buildTargetFileUri(source, targetLang, info);
				await openFileWithCreatePrompt(target, createTemplate);
			} catch (e: any) {
				vscode.window.showErrorMessage(e?.message ?? String(e));
			}
		});
		context.subscriptions.push(disposable);
	}

	// Register sibling openers for all configured languages
	for (const lang of languages) {
		registerOpenSiblingCommand(lang);
	}

	// Open Online URL
	context.subscriptions.push(vscode.commands.registerCommand('m5docs.openOnline', async (uri?: vscode.Uri) => {
		const source = uri ?? vscode.window.activeTextEditor?.document.uri;
		if (!source) return;
		const info = parseDocInfo(source, languages, staticDir, treatReadmeAsIndex);
		if (!info) {
			vscode.window.showErrorMessage(`该文件不在 ${staticDir}/{${languages.join(',')}}/ 结构内。`);
			return;
		}
		const url = buildUrl(onlineBase, info.lang, info.relPathNoExt);
		await vscode.env.openExternal(url);
	}));

	// Open Local Preview URL
	context.subscriptions.push(vscode.commands.registerCommand('m5docs.openPreview', async (uri?: vscode.Uri) => {
		const source = uri ?? vscode.window.activeTextEditor?.document.uri;
		if (!source) return;
		const info = parseDocInfo(source, languages, staticDir, treatReadmeAsIndex);
		if (!info) {
			vscode.window.showErrorMessage(`该文件不在 ${staticDir}/{${languages.join(',')}}/ 结构内。`);
			return;
		}
		const url = buildUrl(previewBase, info.lang, info.relPathNoExt);
		await vscode.env.openExternal(url);
	}));

	// Open from URL
	context.subscriptions.push(vscode.commands.registerCommand('m5docs.openFromUrl', async () => {
		const urlStr = await vscode.window.showInputBox({
			placeHolder: `${onlineBase}/zh_CN/... 或 ${previewBase}/zh_CN/...`,
			prompt: '输入线上或本地预览 URL，自动打开对应 .md 文件（无则可创建）。'
		});
		if (!urlStr) return;

		const parsed = parseUrlToLangAndRel(urlStr, languages);
		if (!parsed) {
			vscode.window.showErrorMessage('无法解析 URL（应包含 /<lang>/<path>）。');
			return;
		}

		const ws = await pickDocsWorkspace(staticDir, languages, docsRootName);
		if (!ws) {
			vscode.window.showErrorMessage('未找到任何已打开的工作区。请先在 VS Code 中打开文档仓库。');
			return;
		}

		// Construct target: <ws>/static/<lang>/<rel>.md
		const relWithExt = parsed.relNoExt.replace(/\/+$/, '') + '.md';
		const target = vscode.Uri.joinPath(ws.uri, staticDir, parsed.lang, ...relWithExt.split('/'));

		await openFileWithCreatePrompt(target, createTemplate);
	}));
}

export function deactivate() { }