> 🌐 **Languages**: **English** | [中文](PRIVACY.zh.md) | [Русский](PRIVACY.ru.md) | [العربية](PRIVACY.ar.md)
>
> ⚖️ The **Chinese version** of this document is the governing version; translations are provided for reference only.

# Author Privacy Policy

**Last Updated: July 4, 2026**
**Effective Date: July 5, 2026**

**Xi'an Dongtian Wuxian Technology Co., Ltd. (西安洞天无限科技有限公司)** (hereinafter "we" or "us"), as the personal information processor for the official Author online services, is deeply aware of the importance of personal information to you and will do everything in its power to keep your personal information safe and secure. We abide by the following principles in protecting your personal information: **consistency of powers and responsibilities, clarity of purpose, choice and consent, minimum necessity, ensuring security, subject participation, and openness and transparency**.

Before using our services, please read carefully and make sure you fully understand this Privacy Policy (hereinafter "this Policy"), in particular the provisions highlighted in **bold**. **By registering an account or using the Cloud Sync service, you are deemed to have read and agreed to this Policy.**

**In short: we do not proactively, routinely, or systematically read your creative content, do not sell your data, do not use your data to train artificial intelligence models, do not use it for advertising or user profiling, and collect only the information necessary to provide the services.**

## Scope of Application of This Policy

This Policy applies to the **official Author account and Cloud Sync services** and the **official web version** (free.author2.com/app) operated by us.

This Policy does **not** apply in the following circumstances:

1. **Offline / local use**: when you do not register an account and do not use Cloud Sync, all Author data is kept solely on your own device, and we neither collect nor receive any information;
2. **Self-hosted instances**: for Author instances deployed by you or a third party using your or its own infrastructure, the deployer is solely responsible for the processing of personal information and shall formulate its own privacy policy in accordance with law;
3. **Third-party services**: the handling of information by third-party services you choose to connect on your own — such as third-party AI service providers and WebDAV storage — is governed by those third parties' own privacy policies;
4. **Our other products or services** (if any): these will be governed by their own separate privacy policies and will not be conflated with this Policy; where new processing purposes are involved, we will separately obtain your consent in accordance with law.

## 1. How We Collect and Use Your Personal Information

Personal information means all kinds of information, recorded electronically or by other means, that can — alone or in combination with other information — identify a specific natural person or reflect the activities of a specific natural person. We collect and use your personal information only for the following purposes described in this Policy:

### (1) Account Registration and Login

1. To create an account, you need to provide: an **email address**, the **password** you set (we store only a salted hash and cannot recover your original password), and the record of the **email verification code** check performed at registration.
2. To maintain your login session and account security, we generate and process **login tokens** and keep records of the **account creation time** and of **account security events such as logins and registrations**.
3. The above information is necessary for providing the account and Cloud Sync services; if you decline to provide it, you will be unable to register an account, but this does not affect your offline use of Author's local features.

### (2) Cloud Sync Service

1. After you enable Cloud Sync, we store the content you actively synchronize: **work indexes, chapter texts, settings collections (characters, locations, worldbuilding, etc.), and chapter memory groups**.
2. **The following data is never synchronized to our servers** (this is enforced by the sync whitelist mechanism in the client code): your third-party AI service API Keys, AI chat histories, editor state, local preferences, and snapshot archives.
3. **Do not** place other people's personal information, sensitive personal information (such as ID document numbers), trade secrets, or illegal content in your works, settings, or notes; if your writing genuinely requires the use of real information, please ensure that you have obtained lawful authorization, and bear the corresponding responsibility yourself.

### (3) Security Assurance and Troubleshooting

To safeguard the security of the services, guard against cyberattacks and abuse, and troubleshoot service failures, our servers automatically record necessary **network logs**, including: **IP address, access time, request path, basic device and browser information (User-Agent), and response status codes**, as well as records of account security events such as successful and failed logins.

**The above logs are used only for security protection, troubleshooting, and cooperating with regulators in accordance with law; they will not be used for advertising, marketing, user profiling, or behavioral analysis unrelated to security.** For retention periods, see Section 7 of this Policy.

### (4) Customer Service and Communications

When you contact us by email or other means, we receive and process the **contact details, problem description, and related materials you voluntarily submit**, and use them to respond to your requests and resolve your issues.

### (5) Statistics and Diagnostics Services

To understand overall product usage, discover and fix defects, and improve stability and performance, we may use the following third-party statistics and diagnostics services on different platforms:

| Service (provider) | Applicable platforms | Data collected | Purpose | Data location |
|---|---|---|---|---|
| Firebase Analytics (Google) | Web version, desktop version, mobile app | App-open events, page/screen paths, app version numbers, coarse device and system categories | Understanding overall usage | Outside mainland China (Google) |
| Firebase Crashlytics (Google) | Mobile app | Crash stacks, device model and system version, app runtime state at the time of the crash | Locating and fixing crashes | Outside mainland China (Google) |
| Firebase Performance (Google) | Mobile app | Metrics such as app startup time, network request latency, and page rendering performance | Monitoring and optimizing performance | Outside mainland China (Google) |
| Vercel Analytics (Vercel) | Only web versions hosted on the Vercel platform | Page views, referrers, coarse geographic region (country/region level) | Understanding access overview | Outside mainland China (Vercel) |
| Vercel Speed Insights (Vercel) | Only web versions hosted on the Vercel platform | Page load and interaction performance metrics | Monitoring web performance | Outside mainland China (Vercel) |

The above services process data in accordance with the respective third parties' own privacy policies, and the related data may be stored on servers outside mainland China. The data collected by these services consists solely of aggregate-level operational data; it does not involve your creative content, API Keys, or synced data, is by default not associated with your account identity, and is not used to profile you as an individual or to serve advertising. It should be specifically noted that the official web version at free.author2.com/app does **not** load the Vercel statistics services; we also plan, in step with the migration away from legacy Firebase, to gradually reduce our reliance on the above overseas services. If we adjust the way we collect statistics, we will update this Policy and inform you.

### (6) Special Notes on AI Features

1. Author serves merely as a **client tool for connecting to the third-party AI services you choose yourself**; it does **not embed, train, host, or provide any artificial intelligence model, model account, or usage quota**. The AI writing features can be used only after you select a service provider yourself, configure an **API Key that you lawfully hold**, and establish a service relationship directly with that provider.
2. **The official web version**: by default, AI requests are sent via a **direct connection from your browser** to the AI service provider you have chosen; your prompts, context, and API Key **do not pass through our servers**. Only in a small number of scenarios (individual providers that do not support direct browser connections, a proxy address you have actively configured, or your enabling of the web search feature) are the relevant requests **relayed in real time** through our servers — **we only relay them; we do not store or log the content of the requests or responses**.
3. **Open-source / desktop / self-hosted use**: AI requests are issued by the local service running on your own device and have nothing to do with our servers.
4. Content you input into a third-party AI service will be processed by that provider in accordance with **its** privacy policy; **when you choose an AI service provider located outside mainland China, the content you input will be transmitted outside mainland China**; that transmission is triggered by your own act of choosing the provider and using the corresponding features. We recommend that you review the privacy policy of your chosen provider before use.

### (7) General Rules on Collection and Use

1. Where we intend to use information for purposes not stated in this Policy, or to use information collected for a specific purpose for other purposes, we will inform you in advance by reasonable means and obtain your consent in accordance with law.
2. We do not collect personal information unrelated to providing the services, and we do not force you to provide information through bundling or similar practices.
3. Our services contain no advertising placements, and we do not use your personal information for commercial marketing pushes; if in the future we genuinely need to send you marketing information related to the services, we will provide a convenient way to opt out in accordance with law, leaving the choice to you.

## 2. Cookies, Local Storage, and Similar Technologies

1. Author is a **local-first** application: your works, settings, API Keys, and other data are stored first of all in the browser storage (IndexedDB, localStorage) of **your own device**; this local data is not uploaded to us merely by virtue of being saved.
2. The official web version uses browser local storage to keep your login tokens, interface preferences, and the like, in order to maintain your login session and user experience; we do **not** use Cookies or similar technologies for cross-site tracking or advertising.
3. Please note: **clearing your browser data will delete local content that has not yet been exported or synchronized**, and it cannot be recovered; please back up your works regularly using the export feature.

## 3. How We Share, Transfer, and Publicly Disclose Your Personal Information

### (1) Sharing and Entrusted Processing

**We do not sell your personal information to any company, organization, or individual.** We share your personal information, or entrust others to process it, only in the following circumstances:

1. **Entrusted processors necessary for delivering service functionality**:

| Entrusted party / third party | Information involved | Purpose and manner | Data location |
|---|---|---|---|
| Cloud infrastructure provider (Tencent Cloud) | Account information, Synced Content, network logs | Providing server and storage infrastructure | Within mainland China |
| Email delivery service | Email address, verification codes | Sending registration verification codes and service notices; **the delivery path may pass through nodes in Hong Kong, China** | See left |
| Legacy cloud sync (Google Firebase, **migration transition period**) | Legacy Firebase user identifier (UID), registration email, the display name and avatar you previously obtained via third-party login, login provider identifier, historical sync data | Migration and service continuity (see Section 8 for details) | **Outside mainland China** (Google) |
| Statistics and diagnostics services (Google Firebase, Vercel, etc.) | Aggregate-level operational, crash, and performance data | Understanding usage, fixing defects, optimizing performance (see Section (5) for the details of each service) | **Outside mainland China** |
| Code hosting (GitHub) | None of your personal information is involved | Publishing open-source code | Outside mainland China |

For entrusted processors, we agree with them on data protection obligations, requiring them to process personal information in accordance with our instructions, this Policy, and the corresponding confidentiality and security measures.

2. **Third parties you choose yourself**: when you configure and use third-party AI services, WebDAV storage, and similar features, the relevant data is, under normal circumstances, sent directly from your device to that third party; this act is triggered by you on your own initiative and does not constitute sharing by us. In scenarios where you have enabled a proxy or web search, or where the provider you have chosen does not support a direct browser connection, Author's servers may, in accordance with your configuration, relay in real time the data necessary to complete the request in question — we act only as a relay channel and do not store or log the content of the requests or responses (see Section 1(6) for details).
3. **Sharing with your explicit consent.**
4. **Sharing as required by law**: providing information externally in accordance with laws and regulations or the mandatory requirements of a competent authority.

### (2) Transfer

We do not transfer your personal information to any company, organization, or individual, except in the following circumstances:

1. with your explicit prior consent;
2. in the event of a merger, division, acquisition, or bankruptcy liquidation, if a transfer of personal information is involved, we will inform you of the name and contact details of the successor and require the successor to remain bound by this Policy; if the successor changes the purposes or means of processing, it will obtain your consent anew in accordance with law.

### (3) Public Disclosure

We publicly disclose your personal information only in the following circumstances:

1. with your explicit consent;
2. on the basis of law, legal process, litigation, or the mandatory requirements of a competent authority. Upon receiving such a disclosure request, we will, in accordance with law, require the requesting party to produce the corresponding legal documents and will review the request prudently.

## 4. How We Protect Your Personal Information

1. Data is **encrypted with TLS throughout transmission**;
2. Synced data is stored on servers **within the territory of the People's Republic of China** and is strictly segregated by account; other users cannot read or write your data;
3. We apply the principles of **access control and least privilege**: only the necessary authorized personnel may access the production environment, for purposes such as operations and fault handling, and such operations are subject to the constraints in Section 5 of this Policy;
4. The database is subject to **periodic backups**, which are rotated and overwritten in cycles (see Section 7), to prevent accidental loss;
5. We will do our best to take reasonable and practicable measures to protect your personal information, but please understand that **the Internet environment is not absolutely secure**. If your lawful rights and interests are harmed because our protective measures are compromised, we will bear the corresponding liability in accordance with law.
6. **Handling of personal information security incidents**: in the unfortunate event of a security incident such as the leakage, tampering, or loss of personal information, we will immediately activate our contingency plan and take remedial measures, and will, as required by laws and regulations, promptly inform you by email, in-app announcement, or similar means of: the basic circumstances and possible impact of the security incident, the measures we have taken or will take to address it, suggestions on how you can guard against and reduce the risks on your own, and the remedies available to you; at the same time, we will report the handling of the incident to the competent authorities in accordance with law.

## 5. Boundaries of Data Access and Content Review

1. **We do not proactively, routinely, or systematically read or review your creative content. The rights in your works belong to you, and privacy protection is our default position.**
2. We access the data of a specific account only in the following circumstances:
   1. **Legal obligations**: laws and regulations, a valid court order, or the binding requirements of a competent authority;
   2. **User reports**: upon receiving a credible report alleging that specific content violates Article 5 of the Terms of Service, we conduct a targeted review **limited exclusively to the reported content** to determine whether a violation exists;
   3. **Automated security alerts**: if we deploy automated content-safety mechanisms (for example, matching against signature databases of known illegal material), we conduct a targeted human re-review of **only the content flagged by the system**;
   4. **Your own requests**: when you request customer support for troubleshooting, data recovery, or migration assistance, we access the necessary data within the scope you have authorized;
   5. **System maintenance**: in operations such as backup restoration and database migration, authorized personnel may come into contact with data in a controlled environment.
3. Any such access adheres to: **specificity** (we do not browse or search works unrelated to the matter at hand), **purpose limitation** (access serves solely to determine compliance or to complete the matter you requested), **minimization** (performed by the fewest necessary authorized personnel), and **auditability** (internally logged and on record).
4. If review confirms the existence of seriously illegal content (see Sections 5.4.1 and 5.4.2 of the Terms of Service), we may preserve the relevant evidence and report it to law enforcement authorities in accordance with law.

## 6. Your Rights

In accordance with the relevant Chinese laws, regulations, and standards, we guarantee your ability to exercise the following rights with respect to your own personal information:

### (1) Accessing and Copying Your Personal Information

You have the right to access and copy your personal information. Your synced data can be viewed in the app at any time, and you can obtain a complete copy through the export feature (multiple common formats are supported); account information can be viewed on the account screen in the app.

### (2) Correcting and Supplementing Your Personal Information

When you find that personal information of yours that we process is erroneous or incomplete, you have the right to ask us to correct or supplement it. Synced Content can be modified directly in the app; for account information (such as changing your email address), you may contact us through the contact channels in Section 10 of this Policy.

### (3) Deleting Your Personal Information

You may request that we delete your personal information in the following circumstances:

1. our processing of personal information violates laws or regulations;
2. we collected or used your personal information without your consent;
3. our processing of personal information breaches our agreement with you;
4. you no longer use our products or services, or you have cancelled your account;
5. we no longer provide you with products or services.

You can delete your works and Synced Content directly in the app (after deletion, the cloud retains only a content-free deletion marker used to keep multi-device synchronization consistent), or apply to cancel your account to have all associated data deleted. After you delete information from our services, the corresponding information in the backup systems will be overwritten and removed within the backup rotation cycle.

### (4) Withdrawing Consent and Changing the Scope of Authorization

1. You may **turn off Cloud Sync** at any time, after which we will no longer receive any new data from you. Author supports fully offline use; you may also switch to sync methods that **do not pass through our servers**, such as WebDAV or LAN sync.
2. Your decision to withdraw consent does not affect the personal information processing already carried out on the basis of your authorization before the withdrawal.

### (5) Cancelling Your Account

You have the right to apply to cancel your account at any time: submit a cancellation request via the contact email in Section 10 of this Policy, and we will complete the process within **15 business days** after verifying your identity. Once the account is cancelled, we will delete or anonymize your personal information and synced data (except where retention is required by laws and regulations). **Before cancelling, please export any data you need to keep; cancellation is irrevocable.**

### (6) Constraining Automated Decision-Making

Our services currently involve **no** circumstances in which decisions that significantly affect your lawful rights and interests are made solely by means of automated decision-making. Should such circumstances exist in the future, you have the right to require an explanation from us and the right to refuse decisions made by us solely by means of automated decision-making.

### (7) Responding to Your Requests

1. To ensure security, before processing your request we may first ask you to verify your identity (for example, by making the request from your registered email address).
2. We will reply to your reasonable requests within **15 business days**, and in principle no fee is charged; for requests that are repeated multiple times or exceed reasonable limits, we may charge a certain cost-based fee as appropriate.
3. As required by laws and regulations, we may be unable to respond to your request in the following circumstances:
   1. where it relates to national security or national defense security;
   2. where it relates to public security, public health, or major public interests;
   3. where it relates to criminal investigation, prosecution, trial, or the enforcement of judgments;
   4. where there is sufficient evidence that the requester acts in subjective bad faith or abuses the right;
   5. where responding to the request would cause serious harm to the lawful rights and interests of you or other individuals or organizations;
   6. where trade secrets are involved.

### (8) Complaints and Reports

If you believe that our processing of personal information has harmed your lawful rights and interests, you may complain to us through the contact channels in Section 10, and we will reply within 15 business days; you also have the right to lodge complaints or reports with the competent authorities, such as the cyberspace administration and the market regulation authorities.

## 7. How We Store Your Personal Information and Retention Periods

1. **Storage location**: personal information we collect and generate within the territory of the People's Republic of China is stored **within the territory of the People's Republic of China**. For the exceptional circumstances involving cross-border data transfer, see the list in Section 3 of this Policy and Section 1(6); we will handle them in accordance with law.
2. **Retention periods**: we retain your personal information only for the shortest period necessary to achieve the purposes described in this Policy, unless laws and regulations require otherwise:

| Information category | Retention period |
|---|---|
| Account information | For the life of the account; deleted or anonymized within 30 days after cancellation is completed |
| Synced Content | For the life of the account; items you delete are removed from the production database immediately, with only a content-free deletion marker retained |
| Network and security logs | Approximately 14 days from generation (rotated and overwritten daily) |
| Database backups | Rotated and overwritten on a 7-day cycle |
| Email verification codes | Short validity period; invalidated once verification is complete |
| Customer service communication records | No more than 1 year after the matter is resolved |
| Evidence of the handling of legal or policy violations | For the period required by law or necessary for handling disputes |

3. After the retention period expires, we will delete or anonymize your personal information. If we cease operating the relevant services, we will, in accordance with the notice arrangements in Section 2.3.1 of the Terms of Service, stop collecting your personal information and delete or anonymize the personal information we already hold.

## 8. Special Notes on the Migration Transition Period

Our Cloud Sync service was previously provided on the basis of Google Firebase (with data stored on Google infrastructure **outside mainland China**). The service has now been migrated to self-built infrastructure within mainland China:

1. the legacy (Firebase) cloud sync is scheduled to be **discontinued at the end of July 2026**;
2. during the transition period, historical data that has not yet been migrated remains stored in Firebase, and may include: the legacy Firebase user identifier (UID), your registration email, the display name and avatar provided by the third party (such as Google) when you previously logged in via that third party, the login provider identifier, and historical sync content; we process the above data solely for the purposes of **migration, backup, and service continuity**;
3. after the legacy service is discontinued, we will delete or deactivate the remaining user data in it;
4. a migration wizard is provided in the app to help you migrate your data to the new Cloud Sync.

## 9. Protection of Minors' Personal Information

1. Our Cloud Sync service is **not directed at children under the age of 14**. Children under 14 may not create accounts or submit personal information through the services, and we do not knowingly collect the personal information of children under 14.
2. If we discover that we have collected the personal information of a child under 14 without prior verifiable guardian consent, we will endeavor to delete the relevant data as soon as possible.
3. Minors under the age of 18 should read this Policy and use the services under the guidance of a guardian.
4. If a guardian discovers that a minor's personal information has been collected without authorization, please notify us through the contact channels in Section 10.

## 10. How to Contact Us

If you have any questions, comments, or suggestions about this Policy, or need to exercise your personal information rights, you may contact us through the following channels:

- **Personal information and privacy matters**: privacy@author2.com
- **Customer service and general inquiries**: support@author2.com
- You may also file an issue in the [GitHub repository](https://github.com/YuanShiJiLoong/author) (please do **not** include your personal information in public issues)

We will reply within **15 business days** after receiving your request and verifying your identity.

## 11. How This Policy Is Updated

1. We may adjust or change this Policy from time to time. Any update to this Policy will be published with its update date indicated, and we will notify you by appropriate means such as website announcements and in-app notices.
2. **For material changes (such as substantive changes to the purposes of processing, the means of processing, the categories of personal information, the storage location, or the parties with whom information is shared), we will notify you in a prominent manner and, where required by law, obtain your consent anew.**
3. **If you do not agree to the changed Policy, you have the right to stop using the Cloud Sync service, export your data, and apply to cancel your account; your continued use of the Cloud Sync service after the changes are published or notified shall be deemed your acceptance of the changed Policy.**

---

*This Policy applies only to the official Author account and Cloud Sync services and the official web version operated by Xi'an Dongtian Wuxian Technology Co., Ltd. The Author open-source software, when used offline and locally, collects and transmits no data; the processing of personal information on self-hosted instances is the responsibility of the deployer.*
