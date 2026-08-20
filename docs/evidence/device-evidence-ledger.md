# Pocket Earth 真机验收账本

## 目标

账本解决“这次只测了 OFF，过几天忘了补 ON”的问题。它是本机验收状态机，不只是 Trace 列表。

## 持久化

- `pe-device-evidence / records`：MNN/SME2 开关配置与快速复测。
- `pe-device-evidence / suites`：正式 ABBA×2 suite；pairs 和 legs 嵌入 suite，以便一个事务原子推进状态机。
- `pe-device-evidence / samples`：每个预热/正式 sample 一行，与 suite 在同一事务中提交。
- `pocket-earth-device-evidence-artifacts / artifacts`：logcat、Perfetto、截图和 APK 哈希文件的 Blob 原件及 SHA-256。
- `devices`：安装身份、设备型号、Android/ABI、MNN 版本和 SME2 硬件能力。

本机安装 ID 也保存在 IndexedDB `meta` store；`localStorage` 只用于一次性迁移旧版 v1 记录，不再承载现行证据。同一手机更新 APK 后保留；清空 App 数据或卸载会删除 IndexedDB，所以正式测试后必须导出 ZIP。

## 状态与失效门

Suite 持久记录 `created / running / paused / invalid / completed / exported`。页面会列出当前 pair、leg、A/B 已完成数和下一步。

以下任一情况不会被继续配对：

- App 版本、MNN 版本、设备/Android/ABI 指纹变化。
- 固定 Input SHA-256 变化。
- A/OFF 未停在 target 2，或 B/ON 没有 `sme2Effective=true`。
- Android thermal status 超过门限、电池温度过高，或同 suite 温差超过 2℃。
- 固定输出质量门失败，或缺少原始/规范化输出 SHA-256。

## 现场展示

1. 展示硬件 SME2、MNN 版本、ABI 与本机 ID。
2. 打开既有的 ABBA×2 记录，展开原始 samples。
3. 展示 A/OFF target 2 和 B/ON target 3 + EFFECTIVE。
4. 展示输出质量门、P50/P95、prefill/decode、温度和 PSS/RSS。
5. 如有时间，只跑一次 2+5 快速复测；正式 56 次调用不放在现场等待。
6. 导出 ZIP，展示 manifest 与 Perfetto/logcat 是否为系统原件。
