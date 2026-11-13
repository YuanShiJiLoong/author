// 服务端 API 路由错误消息的前端本地化。
//
// 背景：app/api/** 的路由处理器跑在 Node 服务端，拿不到用户的界面语言，
// 因此统一返回「中文兜底文案 error + 稳定机器码 code」。前端在展示前用本函数
// 按 code 出三语文案；没有 code（旧接口或未编码的上游原文错误）时回退 error 原文。
//
// 用法：localizeApiError(await res.json(), text)，text 来自 useI18n()。

import { SEARCH_TOOL_LABELS } from './search-config.js';

// 搜索错误的 payload.provider 是搜索工具名，显示成"联网搜索（DeepSeek）"这样的写法
function searchToolLabel(payload, open = ' (', close = ')') {
    const label = SEARCH_TOOL_LABELS[payload?.provider];
    return label ? `${open}${label}${close}` : '';
}

export function localizeApiError(payload, text) {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload;
    const code = payload.code;
    const fallback = payload.error || payload.message || '';
    if (!code) return fallback;

    switch (code) {
        // —— Key / 地址未填 ——
        case 'NO_API_KEY':
            return text('请先填入 API Key', 'Please enter your API Key first.', 'Сначала введите ключ API.');
        case 'NO_API_KEY_CONFIG':
            return text('请先配置 API Key。点击左下角 ⚙️ → API 配置，填入你的 Key', 'Please configure your API Key first. Click ⚙️ (bottom-left) → API Config and enter your Key.', 'Сначала настройте ключ API. Нажмите ⚙️ (внизу слева) → Настройки API и введите ключ.');
        case 'NO_API_KEY_CLAUDE':
            return text('请先配置 Claude 兼容 API Key', 'Please configure your Claude-compatible API Key first.', 'Сначала настройте ключ Claude-совместимого API.');
        case 'NO_API_KEY_GEMINI':
            return text('请先配置 Gemini 原生 API Key', 'Please configure your Gemini native API Key first.', 'Сначала настройте ключ Gemini API.');
        case 'NO_BASE_URL':
            return text('请先填写 API 地址', 'Please enter the API address first.', 'Сначала укажите адрес API.');
        case 'NO_BASE_URL_COMPAT':
            return text('请先填写兼容 API 地址', 'Please enter the compatible API address first.', 'Сначала укажите адрес совместимого API.');
        case 'NO_BASE_URL_OPENAI':
            return text('请先填写 OpenAI 兼容端点地址（通常以 /v1 结尾）', 'Please enter the OpenAI-compatible endpoint address (usually ending with /v1).', 'Сначала укажите адрес OpenAI-совместимого эндпоинта (обычно заканчивается на /v1).');
        case 'NO_BASE_URL_CLAUDE':
            return text('请先填写 Claude 兼容 API 地址', 'Please enter the Claude-compatible API address first.', 'Сначала укажите адрес Claude-совместимого API.');
        case 'NO_BASE_URL_GEMINI':
            return text('请先填写 Gemini 原生 API 地址（通常以 /v1beta 结尾）', 'Please enter the Gemini native API address (usually ending with /v1beta).', 'Сначала укажите адрес Gemini API (обычно заканчивается на /v1beta).');

        // —— 模型列表拉取 ——
        case 'MODELS_FETCH_FAILED':
            return text('未能获取到模型列表，请检查 API 地址和 Key 是否正确', 'Could not fetch the model list. Please check that the API address and Key are correct.', 'Не удалось получить список моделей. Проверьте правильность адреса API и ключа.');
        case 'INVALID_KEY':
            return text('API Key 无效或无权限', 'API Key is invalid or has no permission.', 'Ключ API недействителен или нет прав доступа.');

        // —— 网络 ——
        case 'OUTBOUND_FAKE_IP_BLOCKED':
            return text(
                'API 域名被解析成了 198.18.x.x，这是代理工具 fake-ip 模式给的假地址，服务端按内网地址拦截了。可以在代理工具里把这个域名加入 fake-ip 过滤名单（或关闭 TUN / fake-ip），或者设置环境变量 AUTHOR_ALLOW_PRIVATE_NETWORK=1 后重启。',
                'The API domain resolved to 198.18.x.x, a placeholder address from a proxy tool\'s fake-ip mode, so the server blocked it as a private address. Add the domain to the proxy\'s fake-ip filter (or turn off TUN / fake-ip), or set AUTHOR_ALLOW_PRIVATE_NETWORK=1 and restart.',
                'Домен API разрешился в 198.18.x.x — это фиктивный адрес режима fake-ip прокси-программы, поэтому сервер заблокировал его как внутренний. Добавьте домен в фильтр fake-ip прокси (или отключите TUN / fake-ip) либо задайте переменную окружения AUTHOR_ALLOW_PRIVATE_NETWORK=1 и перезапустите.'
            );
        case 'NETWORK_ERROR':
            return text('网络连接失败，请检查 API 地址', 'Network connection failed. Please check the API address.', 'Сбой сетевого подключения. Проверьте адрес API.');
        case 'NETWORK_ERROR_CHECK':
            return text('网络连接失败，请检查 API 地址是否正确', 'Network connection failed. Please check that the API address is correct.', 'Сбой сетевого подключения. Проверьте правильность адреса API.');
        case 'NETWORK_ERROR_PROXY':
            return text('网络连接失败，请检查兼容 API 地址或代理设置', 'Network connection failed. Please check the compatible API address or proxy settings.', 'Сбой сетевого подключения. Проверьте адрес совместимого API или настройки прокси.');

        // —— Embedding 配置 ——
        case 'NO_BASE_URL_EMBED':
            return text('请先填写 Embedding 兼容 API 地址', 'Please enter the Embedding-compatible API address first.', 'Сначала укажите адрес Embedding-совместимого API.');
        case 'NO_EMBED_MODEL':
            return text('请先选择或填写 Embedding 模型', 'Please select or enter an Embedding model first.', 'Сначала выберите или укажите модель Embedding.');
        case 'NO_EMBED_KEY':
            return text('请在 API 配置中填写独立的 Embedding API Key', 'Please enter a dedicated Embedding API Key in API Config.', 'Укажите отдельный ключ Embedding API в настройках API.');
        case 'NO_API_KEY_FOR_EMBED':
            return text('请先配置 API Key', 'Please configure your API Key first.', 'Сначала настройте ключ API.');
        case 'INVALID_INPUT':
            return text('无效的文本输入', 'Invalid text input.', 'Недопустимый текстовый ввод.');

        // —— 余额 ——
        case 'BALANCE_NO_API_KEY':
            return text('未配置 API Key', 'API Key is not configured.', 'Ключ API не настроен.');
        case 'BALANCE_QUERY_FAILED':
            return text('查询失败', 'Query failed.', 'Запрос не удался.');

        // —— 连接测试（回退文案，可带 HTTP 状态码）——
        case 'CONN_FAILED':
            return text('连接失败', 'Connection failed', 'Ошибка подключения') + (payload.status ? ` (${payload.status})` : '');

        // —— Embedding 调用失败（带 provider/model/status，可能附带上游 detail 与排查提示）——
        case 'EMBED_CALL_FAILED': {
            const head = text(
                `${payload.provider || 'Embedding'} 模型 ${payload.model || '未指定'} 调用失败 (${payload.status})`,
                `${payload.provider || 'Embedding'} model "${payload.model || 'unspecified'}" call failed (${payload.status})`,
                `Вызов модели ${payload.provider || 'Embedding'} «${payload.model || 'не указана'}» не удался (${payload.status})`
            );
            const hint = localizeEmbedHint(payload.hintCode, text);
            return [head, payload.detail, hint].filter(Boolean).join(text('：', ': ', ': '));
        }
        case 'EMBED_NO_VECTOR':
            return text(
                `${payload.provider || 'Embedding'} 模型 ${payload.model || '未指定'} 没有返回有效向量，请确认选择的是 Embedding 模型而不是对话模型。`,
                `${payload.provider || 'Embedding'} model "${payload.model || 'unspecified'}" returned no valid vector. Make sure you selected an embedding model, not a chat model.`,
                `Модель ${payload.provider || 'Embedding'} «${payload.model || 'не указана'}» не вернула вектор. Убедитесь, что выбрана модель эмбеддингов, а не чата.`
            );
        case 'EMBED_REQUEST_FAILED':
            return text('Embedding 请求失败', 'Embedding request failed.', 'Запрос Embedding не удался.');

        // —— 主 AI 路由（写作/聊天时的上游错误）——
        case 'AI_GENERATION_CANCELLED':
            return text('已停止生成。', 'Generation stopped.', 'Генерация остановлена.');
        case 'AI_GENERATION_TIMEOUT':
            return text('生成超时，内容尚未完成，请重试。', 'Generation timed out and is incomplete. Please retry.', 'Время генерации истекло, текст не завершён. Повторите попытку.');
        case 'AI_STREAM_INCOMPLETE':
        case 'AI_STREAM_INVALID':
        case 'AI_STREAM_TOO_LARGE':
            return text('生成中断，内容未完成，请重试。', 'Generation was interrupted and is incomplete. Please retry.', 'Генерация прервалась, текст не завершён. Повторите попытку.');
        case 'AI_STREAM_FAILED':
            return text('AI 服务在生成途中报错，内容未完成，请重试。', 'The AI service failed during generation. Content is incomplete. Please retry.', 'Сервис ИИ сообщил об ошибке во время генерации. Текст не завершён. Повторите попытку.');
        case 'AI_INVALID_KEY':
            return text('API Key 无效或已过期，请检查后重新填写', 'API Key is invalid or expired. Please check and re-enter it.', 'Ключ API недействителен или истёк. Проверьте и введите заново.');
        case 'AI_RATE_LIMIT':
            return text('请求频率过高或额度不足，请稍后再试', 'Too many requests or insufficient quota. Please try again later.', 'Слишком много запросов или недостаточно квоты. Повторите позже.');
        case 'AI_INSUFFICIENT_QUOTA':
            return text('API 账户余额不足，请充值后重试', 'Insufficient account balance. Please top up and retry.', 'Недостаточно средств на счёте API. Пополните баланс и повторите.');
        case 'AI_CONTEXT_TOO_LONG':
            return text('上下文过长：设定集 + 前文 + 对话内容超出模型上下文窗口，请减少勾选的参考内容或清空对话历史', 'Context too long: settings + previous text + conversation exceed the model context window. Reduce the selected references or clear the chat history.', 'Контекст слишком длинный: настройки + предыдущий текст + диалог превышают окно контекста модели. Уменьшите выбранные материалы или очистите историю чата.');
        case 'AI_INPUT_TOO_LONG':
            return text('输入内容过长，请减少勾选的参考内容或缩短对话历史', 'Input is too long. Reduce the selected references or shorten the chat history.', 'Слишком длинный ввод. Уменьшите выбранные материалы или сократите историю чата.');
        case 'AI_SERVICE_ERROR':
            return text('AI 服务错误', 'AI service error', 'Ошибка сервиса ИИ') + (payload.detail ? text('：', ': ', ': ') + payload.detail : '');
        case 'AI_RETURNED_ERROR':
            return text(`AI 服务返回错误 (${payload.status})，请检查 API 配置`, `AI service returned an error (${payload.status}). Please check the API config.`, `Сервис ИИ вернул ошибку (${payload.status}). Проверьте настройки API.`);
        case 'AI_NO_PERMISSION':
            return text('API Key 无权限或已被禁用', 'API Key has no permission or has been disabled.', 'У ключа API нет прав или он отключён.');
        case 'AI_OVERLOADED':
            return text('Anthropic API 过载，请稍后再试', 'Anthropic API is overloaded. Please try again later.', 'Anthropic API перегружен. Повторите позже.');

        // —— 联网搜索（Function Calling 外部搜索；payload.provider 是搜索工具）——
        case 'SEARCH_NO_BASE_URL':
            return text(`请先填写联网搜索${searchToolLabel(payload, '（', '）')}的 API 地址`, `Please enter the web search${searchToolLabel(payload)} API URL first.`, `Сначала укажите адрес API веб-поиска${searchToolLabel(payload)}.`);
        case 'SEARCH_NO_API_KEY':
            return text(`请先配置联网搜索${searchToolLabel(payload, '（', '）')}的 API Key`, `Please configure the web search${searchToolLabel(payload)} API key first.`, `Сначала настройте API-ключ веб-поиска${searchToolLabel(payload)}.`);
        case 'SEARCH_INVALID_QUERY':
            return text('搜索关键词不能为空', 'The search query cannot be empty.', 'Поисковый запрос не может быть пустым.');
        case 'SEARCH_INVALID_KEY':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}的 API Key 无效或无权限，搜索没有完成，回答可能缺少最新资料。请到 设置 → API配置 → 联网搜索 检查。`, `The web search${searchToolLabel(payload)} API key is invalid or not allowed, so the search did not run and the answer may miss recent information. Check Settings -> API Config -> Web Search.`, `API-ключ веб-поиска${searchToolLabel(payload)} недействителен или не имеет доступа: поиск не выполнен, в ответе может не хватать свежих данных. Проверьте Настройки -> API -> Веб-поиск.`);
        case 'SEARCH_INSUFFICIENT_BALANCE':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}账户余额不足，搜索没有完成，回答可能缺少最新资料。充值后再试。`, `The web search${searchToolLabel(payload)} account balance is too low, so the search did not run and the answer may miss recent information. Top up and retry.`, `Недостаточно средств на счёте веб-поиска${searchToolLabel(payload)}: поиск не выполнен, в ответе может не хватать свежих данных. Пополните баланс и повторите.`);
        case 'SEARCH_RATE_LIMITED':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}请求太频繁，被限速了，部分搜索没有完成，回答可能缺少最新资料。等几秒再试。`, `Web search${searchToolLabel(payload)} was rate-limited because of too many requests. Some searches did not run, so the answer may miss recent information. Wait a few seconds and retry.`, `Веб-поиск${searchToolLabel(payload)} ограничен из-за слишком частых запросов: часть запросов не выполнена, в ответе может не хватать свежих данных. Подождите несколько секунд и повторите.`);
        case 'SEARCH_UNAVAILABLE':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}暂时不可用，部分搜索没有完成，回答可能缺少最新资料。请稍后再试。`, `Web search${searchToolLabel(payload)} is temporarily unavailable. Some searches did not run, so the answer may miss recent information. Please retry later.`, `Веб-поиск${searchToolLabel(payload)} временно недоступен: часть запросов не выполнена, в ответе может не хватать свежих данных. Повторите позже.`);
        case 'SEARCH_REQUEST_REJECTED':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}拒绝了请求，部分搜索没有完成。请检查搜索的 API 地址。`, `Web search${searchToolLabel(payload)} rejected the request, so some searches did not run. Check the search API URL.`, `Веб-поиск${searchToolLabel(payload)} отклонил запрос, часть запросов не выполнена. Проверьте адрес API поиска.`);
        case 'FETCH_INVALID_URL':
            return text(`读取网页${searchToolLabel(payload, '（', '）')}：网页地址格式不对（只支持 http 或 https），没有读取。`, `Page reading${searchToolLabel(payload)}: the page URL is not valid (only http or https), so it was not read.`, `Чтение страницы${searchToolLabel(payload)}: неверный адрес страницы (только http или https), страница не прочитана.`);
        case 'FETCH_BLOCKED':
            return text(`读取网页${searchToolLabel(payload, '（', '）')}：这个网站不允许读取，回答里没有用上网页全文。`, `Page reading${searchToolLabel(payload)}: this site does not allow reading, so the answer does not use the full page text.`, `Чтение страницы${searchToolLabel(payload)}: сайт не разрешает чтение, ответ дан без полного текста страницы.`);
        case 'FETCH_UNREADABLE':
            return text(`读取网页${searchToolLabel(payload, '（', '）')}：没能读到这个网页的正文（可能打不开，或不是文字页面），回答里没有用上网页全文。`, `Page reading${searchToolLabel(payload)}: could not read the page text (the page may be unavailable or not a text page), so the answer does not use it.`, `Чтение страницы${searchToolLabel(payload)}: не удалось прочитать текст страницы (она может быть недоступна или не содержит текста), ответ дан без него.`);
        case 'SEARCH_INVALID_RESPONSE':
            return text(`联网搜索${searchToolLabel(payload, '（', '）')}返回了无法识别的结果，请检查搜索的 API 地址。`, `Web search${searchToolLabel(payload)} returned an unrecognized response. Check the search API URL.`, `Веб-поиск${searchToolLabel(payload)} вернул нераспознанный ответ. Проверьте адрес API поиска.`);

        // —— 文件解析 / 同步 ——
        case 'REQUEST_TOO_LARGE':
        case 'FILE_TOO_LARGE':
            return text('请求或文件体积过大，请分段或拆分文件后重试。', 'The request or file is too large. Split it and retry.', 'Запрос или файл слишком большой. Разделите его и повторите попытку.');
        case 'RATE_LIMITED':
        case 'SERVER_BUSY':
            return text('当前请求较多，请稍后重试。', 'Too many active requests. Please retry shortly.', 'Слишком много запросов. Повторите попытку чуть позже.');
        // —— WebDAV（坚果云等）——
        case 'WEBDAV_AUTH_FAILED':
            return text('WebDAV 认证失败，请检查账号和应用密码。', 'WebDAV authentication failed. Check the account and app password.', 'Ошибка аутентификации WebDAV. Проверьте учётную запись и пароль приложения.');
        case 'WEBDAV_PATH_NOT_FOUND':
            return text('WebDAV 路径不存在，请检查同步目录。', 'The WebDAV path does not exist. Check the sync folder.', 'Путь WebDAV не существует. Проверьте папку синхронизации.');
        case 'WEBDAV_COLLECTION_CONFLICT':
            return text('WebDAV 目录不存在或无法创建，请检查同步目录权限。', 'The WebDAV folder is missing or could not be created. Check the sync folder permissions.', 'Папка WebDAV отсутствует или не может быть создана. Проверьте права доступа.');
        case 'WEBDAV_UPSTREAM_UNREACHABLE':
            return text('连接不上 WebDAV 服务器，请检查网络和 WebDAV 地址。', 'Could not reach the WebDAV server. Check your network and the WebDAV address.', 'Не удалось подключиться к серверу WebDAV. Проверьте сеть и адрес WebDAV.');
        case 'WEBDAV_UPSTREAM_ERROR':
            return text(`WebDAV 服务器返回错误${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ''}，请稍后重试。`, `The WebDAV server returned an error${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ''}. Please retry later.`, `Сервер WebDAV вернул ошибку${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ''}. Повторите попытку позже.`);
        case 'WEBDAV_REQUEST_INVALID':
            return text('WebDAV 请求无效，请检查地址和同步目录填写是否正确。', 'The WebDAV request was invalid. Check the address and sync folder.', 'Некорректный запрос WebDAV. Проверьте адрес и папку синхронизации.');

        case 'REQUEST_TIMEOUT':
            return text('上传或请求读取超时，请重试。', 'Upload or request reading timed out. Please retry.', 'Время загрузки или чтения запроса истекло. Повторите попытку.');
        case 'REQUEST_CANCELLED':
            return text('请求已取消。', 'Request cancelled.', 'Запрос отменён.');
        case 'INVALID_UPLOAD':
            return text('请上传一个有效的 PDF 或 DOC 文件。', 'Please upload one valid PDF or DOC file.', 'Загрузите один корректный файл PDF или DOC.');
        case 'PARSE_TIMEOUT':
        case 'PARSE_RESOURCE_LIMIT':
            return text('文件解析超过时间或资源限制，请拆分文件后重试。', 'File parsing exceeded its time or resource limit. Split the file and retry.', 'Превышен лимит времени или ресурсов обработки. Разделите файл и повторите попытку.');
        case 'PARSE_UNAVAILABLE':
            return text('文件解析服务暂不可用，请稍后重试。', 'File parsing is temporarily unavailable. Please retry later.', 'Обработка файлов временно недоступна. Повторите попытку позже.');
        case 'NO_FILE':
            return text('未提供文件', 'No file provided.', 'Файл не предоставлен.');
        case 'UNSUPPORTED_FORMAT':
            return text('不支持的文件格式', 'Unsupported file format.', 'Неподдерживаемый формат файла.');
        case 'PARSE_FAILED':
            return text('解析失败', 'Parsing failed', 'Не удалось разобрать') + (payload.detail ? text('：', ': ', ': ') + payload.detail : '');
        case 'PARSE_NO_TEXT':
            return text('文件中未能提取到文本内容（可能是扫描件或图片PDF）', 'No text could be extracted from the file (it may be a scan or image-only PDF).', 'Не удалось извлечь текст из файла (возможно, это скан или PDF из изображений).');
        case 'SHARE_NOT_FOUND':
            return text('分享不存在或已过期', 'The share does not exist or has expired.', 'Общий доступ не существует или истёк.');

        // —— 版本 / 自动更新 ——
        case 'CANNOT_READ_VERSION':
            return text('无法读取当前版本号', 'Could not read the current version number.', 'Не удалось прочитать номер текущей версии.');
        case 'CHECK_UPDATE_FAILED':
            return text('检查更新失败', 'Failed to check for updates.', 'Не удалось проверить обновления.');
        case 'NOT_SOURCE_DEPLOY':
            return text('非源码部署环境，无法执行自动更新', 'Not a source-code deployment; automatic update is unavailable.', 'Это не развёртывание из исходного кода; автообновление недоступно.');
        case 'UPDATE_STEP_FAILED':
            return text(`步骤 ${payload.step} 失败`, `Step ${payload.step} failed`, `Шаг ${payload.step} не выполнен`) + (payload.label ? text('：', ': ', ': ') + payload.label : '');

        default:
            return fallback;
    }
}

// Embedding 调用失败时按 HTTP 状态给出的排查提示
function localizeEmbedHint(hintCode, text) {
    switch (hintCode) {
        case 'EMBED_HINT_AUTH':
            return text('请检查 Embedding API Key 是否正确，并确认该 Key 有调用当前嵌入模型的权限。', 'Check that the Embedding API Key is correct and has permission to call the current embedding model.', 'Проверьте правильность ключа Embedding API и наличие прав на вызов текущей модели эмбеддингов.');
        case 'EMBED_HINT_ADDR':
            return text('请检查 Embedding API 地址是否正确。OpenAI 兼容地址通常需要包含 /v1，最终会请求 /embeddings。', 'Check the Embedding API address. OpenAI-compatible addresses usually include /v1 and will request /embeddings.', 'Проверьте адрес Embedding API. Адреса, совместимые с OpenAI, обычно содержат /v1 и обращаются к /embeddings.');
        case 'EMBED_HINT_RATE':
            return text('请求过于频繁或额度不足，请稍后重试，或降低重建频率。', 'Too many requests or insufficient quota. Please retry later or lower the rebuild frequency.', 'Слишком много запросов или недостаточно квоты. Повторите позже или снизьте частоту перестроения.');
        default:
            return '';
    }
}
