## 📋 本次焕新简报 / Release Overview

本次常规更新（v1.2.10）为高频请求作者们带来了一项硬核杀手锏特性——**API Key 级负载均衡与调用池（Key Pool Load Balancing）**。它将伴随着多节点并发调用，彻底打破单一模型账单或服务商的速率限流瓶颈（Rate Limits）。

### 🇨🇳 中文更新概览

- ⚖️ **全新 API 密钥池与负载均衡策略**：不再局限于单一凭证！现在你可以在 API 设定中通过英文逗号（`,`）一次性填入多个 API Key 以构建「钥匙池」了（例如：`sk-a,sk-b,sk-c`）。
- 🚀 **突破限频，智能高并发轮询**：Author 底层网络请求模块现已接管了一套随机算法轮询拦截器（Key Rotator）。无论是你点击生成速度极快连续续写，还是面对长篇多文档大体量设定集并发做 RAG 向量化（Embedding）更新请求，系统都会在底层智能且隐形地分摊并发流量到不同的 Key 上，大幅降爆 429 请求超限错误率。
- 🌍 **多国语言与内部文档全面解谜**：不仅在 UI 面板（应用内帮助文档）更新了关于负载均衡特性的详细讲解，而且我们一并将中/英/俄/阿四国语言环境下的全仓 `README.md` 也进行了详尽且统一的机制说明补全，确保信息完美同步。

📦 全自动封装构建流程完毕，点击下方 `.exe` 图标即可立刻安装。

---

### 🇺🇸 English Release Notes

The Version 1.2.10 update arrives with a much-requested, hardcore optimization geared heavily toward our powerhouse writers: **Native API Key Pooling & Load Balancing**. This breakthrough allows fluid, rapid multi-node scaling without immediately hitting provider-imposed strict Rate Limits (429 errors).

- ⚖️ **Fluid Multi-API Key Load Pools:** Let's transcend single-credential locks! You can now string together multiple API keys comma-separated (e.g., `sk-one,sk-two,sk-three`) within your settings, dynamically constructing a multi-layered local credential "Key Pool".
- 🚀 **Anti-Rate-Limit Traffic Rotator:** We embedded a brand-new Key Rotator interceptor down deep inside Author's network handling stack. Whether you are blasting fast ghost-text continuations or triggering massive batch API requests for RAG background-embeddings processing during initial 50+ lore setups—the system now silently spreads internal traffic uniformly across random keys, practically crushing aggressive IP/token request limits.
- 🌍 **Omni-Lingual Documentation Refresh:** Every corner of our readmes—EN, RU, AR, ZH—combined with offline inner-UI help panels, has been deeply overhauled detailing this specific Load-Balancing trick, securing uniform intel-syncs worldwide.

📦 Simply grab the `.exe` installer right below and launch your new high-volume creative rig.
