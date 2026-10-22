import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const ctx = { URL };
runInNewContext(readFileSync(new URL("../public/ai-block.js", import.meta.url), "utf8"), ctx);
const { isBlocked, MESSAGE } = ctx.saintsAiBlock;

test("AI chat sites and providers are blocked, subdomains included", () => {
  for (const url of [
    "https://gemini.google.com/app", "https://chatgpt.com/", "https://chat.openai.com/", "https://platform.openai.com/",
    "https://claude.ai/new", "https://www.perplexity.ai/", "https://copilot.microsoft.com/", "https://chat.deepseek.com/",
    "https://grok.com/", "https://www.meta.ai/", "https://character.ai/", "https://poe.com/", "https://chat.mistral.ai/",
    "https://huggingface.co/chat", "https://aistudio.google.com/", "https://notebooklm.google.com/", "https://duck.ai/",
    "https://chat.qwen.ai/", "https://www.gauthmath.com/", "https://free-chatgpt.net/", "https://aichatonline.org/",
    "https://GEMINI.google.com./",
  ]) assert.equal(isBlocked(url), true, url);
});

test("AI features inside ordinary sites are blocked", () => {
  for (const url of [
    "https://www.google.com/search?q=hello&udm=50", "https://www.bing.com/chat", "https://www.bing.com/search?q=x&showconv=1",
    "https://duckduckgo.com/?q=x&ia=chat", "https://x.com/i/grok", "https://github.com/copilot",
  ]) assert.equal(isBlocked(url), true, url);
});

test("ordinary sites, and searching for AI by name, are not blocked", () => {
  for (const url of [
    "https://www.google.com/search?q=chatgpt", "https://www.google.com/", "https://www.bing.com/search?q=claude",
    "https://duckduckgo.com/?q=gemini", "https://x.com/home", "https://github.com/viztrrx", "https://m.youtube.com/",
    "https://www.tiktok.com/", "https://mail.google.com/", "https://docs.google.com/", "https://claude.ai.example.org/",
    "https://wikipedia.org/wiki/ChatGPT", "https://www.reddit.com/r/ChatGPT/", "not a url", "about:blank",
  ]) assert.equal(isBlocked(url), false, url);
});

test("the notice tells people to use the Saints Service AI", () => {
  assert.match(MESSAGE, /unsafe and inaccurate/);
  assert.match(MESSAGE, /Saints Service/);
});
