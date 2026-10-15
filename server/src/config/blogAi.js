export const DEFAULT_BLOG_GROQ_MODEL = 'qwen/qwen3.8-27b';

// Blog model choices are independent of delivery captions and assistant replies.
// Both providers use Qwen, including during provider failover.
export const blogModelOptions = () => ({
  primaryTextModel: String(process.env.GROQ_BLOG_MODEL || DEFAULT_BLOG_GROQ_MODEL).trim() || DEFAULT_BLOG_GROQ_MODEL,
  fallbackModel: String(process.env.ALIBABA_BLOG_MODEL || 'qwen-plus').trim() || 'qwen-plus'
});
