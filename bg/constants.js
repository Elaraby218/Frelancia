// ==========================================
// bg/constants.js — Shared constants
// ==========================================

const MOSTAQL_URLS = {
  development: 'https://mostaql.com/projects?category=development&sort=latest',
  ai: 'https://mostaql.com/projects?category=ai-machine-learning&sort=latest',
  all: 'https://mostaql.com/projects?sort=latest'
};

const DEFAULT_PROMPTS = [
  {
    id: 'default_proposal',
    title: 'كتابة عرض مشروع',
    content: `أريد مساعدتك في كتابة عرض لهذا المشروع على منصة مستقل.

عنوان المشروع: {title}
القسم: {category}

تفاصيل المشروع:
الميزانية: {budget}
مدة التنفيذ: {duration}
تاريخ النشر: {publish_date}
الوسوم: {tags}

معلومات صاحب العمل:
الاسم: {client_name} ({client_type})

رابط المشروع: {url}

وصف المشروع:
{description}

يرجى كتابة عرض احترافي ومقنع يوضح خبرتي في هذا المجال ويشرح كيف يمكنني تنفيذ المطلوب بدقة، مع مراعاة تفاصيل المشروع ومتطلبات العميل.

تعليمات هامة جداً:
1. اكتب نص العرض النهائي والجاهز للتقديم مباشرة فقط.
2. لا تضف أي مقدمات أو شروحات أو ملاحظات جانبية أو تعليقات قبل أو بعد العرض (مثال: لا تكتب "إليك العرض المقترح" أو "تم توليد العرض بنجاح" أو أي توجيهات للمستقل بتعديل الكلمات بين أقواس).
3. ابدأ العرض مباشرة بعبارة ترحيبية مهنية ملائمة للمشروع، وصِغ العرض بأسلوب مقنع وواضح يركز على تلبية احتياجات العميل وكيفية تنفيذها وان يكون مكتوب باللغة العربية المصرية وبدون تشكيل او تجويد او تنقيط وخلافه وبطريقة لا توضح انه مكتوب بالذكاء الاصطناعي.`
  }
];

// Set by background.js after importScripts succeeds
// Must use var so it is accessible as a global across all importScripts files
var SIGNALR_AVAILABLE = false;
