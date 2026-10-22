"use strict";

// What the proxy won't show, and what it says instead:
//   ai  AI chat sites and AI providers: people are sent back to the Saints
//       Service console's own AI.
// Loaded by the page (index.js shows the notice) and by the service worker
// (sw.js refuses the requests, so links, redirects, pop-ups and scripts can't
// get around the page).
(function (scope) {
  const KINDS = {
    ai: {
      kind: "ai",
      title: "AI isn\u2019t allowed here",
      message: "This AI is unsafe and inaccurate. Please go back to using the AI in the Saints Service interface.",
    },
  };

  // Whole sites, subdomains included (chat.deepseek.com is deepseek.com).
  const HOSTS = [
    // OpenAI / ChatGPT
    "openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com", "sora.com",
    // Google
    "gemini.google.com", "bard.google.com", "aistudio.google.com", "notebooklm.google.com",
    "notebooklm.google", "labs.google", "deepmind.google", "deepmind.com", "ai.google.dev",
    "generativelanguage.googleapis.com", "makersuite.google.com", "socratic.org",
    // Anthropic
    "claude.ai", "claude.com", "anthropic.com",
    // Microsoft Copilot
    "copilot.microsoft.com", "copilot.cloud.microsoft", "sydney.bing.com",
    // Meta, xAI
    "meta.ai", "grok.com", "x.ai",
    // Other chat assistants and model providers
    "perplexity.ai", "pplx.ai", "poe.com", "character.ai", "c.ai", "deepseek.com",
    "mistral.ai", "you.com", "phind.com", "huggingface.co", "hf.co", "pi.ai", "inflection.ai",
    "cohere.com", "groq.com", "together.ai", "replicate.com", "openrouter.ai", "lmarena.ai",
    "lmsys.org", "chathub.gg", "monica.im", "getmerlin.in", "duck.ai", "blackbox.ai",
    "deepai.org", "qwen.ai", "qwenlm.ai", "tongyi.aliyun.com", "kimi.com", "kimi.ai",
    "moonshot.cn", "chatglm.cn", "z.ai", "doubao.com", "yiyan.baidu.com", "minimax.io",
    "hailuoai.com", "ollama.com", "fireworks.ai", "cerebras.ai", "jan.ai", "nat.dev",
    "typingmind.com", "chatbot.app", "chatsonic.com", "askai.free",
    // Companion / role-play chatbots
    "janitorai.com", "crushon.ai", "spicychat.ai", "candy.ai", "talkie-ai.com", "replika.com",
    "chai.ml", "chai-research.com", "novelai.net", "agnai.chat", "chub.ai",
    // Writing, coding and homework AI
    "jasper.ai", "writesonic.com", "copy.ai", "rytr.me", "sudowrite.com", "quillbot.com",
    "cursor.com", "codeium.com", "windsurf.com", "v0.dev", "v0.app", "bolt.new", "lovable.dev",
    "tabnine.com", "gauthmath.com", "gauth.com", "questionai.com", "studyx.ai", "solvely.ai",
    "answerai.pro", "homeworkify.net", "mathgptpro.com", "photomath.com",
    // Image, video, voice and music AI
    "midjourney.com", "leonardo.ai", "ideogram.ai", "runwayml.com", "pika.art", "suno.com",
    "suno.ai", "udio.com", "elevenlabs.io", "stability.ai", "dreamstudio.ai", "playground.com",
    "krea.ai", "firefly.adobe.com", "lumalabs.ai", "klingai.com", "hedra.com", "heygen.com",
    "synthesia.io",
  ];
  // Words that only show up in the names of AI chat sites
  // ("chatgpt.org", "free-chatgpt.net", "aichatonline.org").
  const HOST_WORDS = /chatgpt|chat-gpt|gptchat|gpt4|gpt-4|gpt5|aichat|chatai|openai|gemini-ai|claudeai/;

  // AI inside sites that are otherwise fine.
  const PAGES = [
    // Google's AI Mode in search results
    ["google.com", (u) => u.searchParams.get("udm") === "50" || /^\/(aimode|search\/ai)/i.test(u.pathname)],
    // Copilot in Bing
    ["bing.com", (u) => /^\/(chat|copilot|images\/create|create)/i.test(u.pathname) || u.searchParams.get("showconv") === "1"],
    // Duck.ai in DuckDuckGo
    ["duckduckgo.com", (u) => /^\/(aichat|chat)/i.test(u.pathname) || u.searchParams.get("ia") === "chat"],
    // Grok on X
    ["x.com", (u) => /^\/i\/grok/i.test(u.pathname)],
    ["twitter.com", (u) => /^\/i\/grok/i.test(u.pathname)],
    // GitHub Copilot chat
    ["github.com", (u) => /^\/copilot/i.test(u.pathname)],
    // Brave's AI answers
    ["search.brave.com", (u) => /^\/(ask|chat)/i.test(u.pathname) || u.searchParams.get("summary") === "1"],
    // Snapchat's My AI on the web
    ["snapchat.com", (u) => /^\/(myai|my-ai)/i.test(u.pathname)],
  ];

  const onHost = (host, domain) => host === domain || host.endsWith("." + domain);

  // Why this real (not proxied) web address is blocked: one of KINDS, or null.
  function check(address) {
    let u;
    try { u = address instanceof URL ? address : new URL(String(address)); } catch { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:" && u.protocol !== "wss:" && u.protocol !== "ws:") return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (HOSTS.some((d) => onHost(host, d))) return KINDS.ai;
    if (HOST_WORDS.test(host)) return KINDS.ai;
    if (PAGES.some(([d, test]) => onHost(host, d) && test(u))) return KINDS.ai;
    return null;
  }

  scope.saintsBlock = { check, KINDS };
})(typeof self !== "undefined" ? self : globalThis);
