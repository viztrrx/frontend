import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const ctx = { URL };
runInNewContext(readFileSync(new URL("../public/blocked.js", import.meta.url), "utf8"), ctx);
const { check, KINDS } = ctx.saintsBlock;
const isBlocked = (url) => check(url)?.kind === "ai";
const MESSAGE = KINDS.ai.message;

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

test("Google sign-in pages are blocked as Google sign-in", () => {
  for (const url of [
    "https://accounts.google.com/", "https://accounts.google.com/v3/signin/identifier?continue=x",
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=https://site.example/cb",
    "https://accounts.google.com/signin/oauth/consent", "https://accounts.google.com/gsi/button?type=standard",
    "https://accounts.google.com/gsi/select", "https://accounts.google.co.uk/ServiceLogin",
  ]) assert.equal(check(url)?.kind, "googleSignIn", url);
  assert.equal(KINDS.googleSignIn.message, "This proxy doesn\u2019t support signing in with Google. Please go back and sign in a different way.");
});

test("YouTube and Google's other sites work without signing in", () => {
  for (const url of [
    // YouTube, including what it loads in the background for signed-out viewers
    "https://www.youtube.com/", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/results?search_query=music",
    "https://www.youtube.com/shorts/abc", "https://music.youtube.com/", "https://youtubei.googleapis.com/youtubei/v1/player",
    "https://i.ytimg.com/vi/x/hq.jpg", "https://rr1---sn-x.googlevideo.com/videoplayback", "https://consent.youtube.com/m?continue=x",
    "https://accounts.youtube.com/accounts/CheckConnection?pmpo=x", "https://accounts.youtube.com/accounts/SetSID",
    // Google's background account checks on every Google site
    "https://accounts.google.com/ListAccounts?gpsia=1", "https://accounts.google.com/RotateCookiesPage?og_pid=1",
    "https://accounts.google.com/CheckCookie", "https://accounts.google.com/accounts/CheckConnection",
    "https://ogs.google.com/widget/app", "https://consent.google.com/",
    // Everything else Google runs that works signed out
    "https://www.google.com/", "https://www.google.com/search?q=chatgpt", "https://www.google.com/maps", "https://maps.google.com/",
    "https://translate.google.com/", "https://news.google.com/", "https://docs.google.com/document/d/x/view",
    "https://drive.google.com/file/d/x/view", "https://sites.google.com/view/x", "https://play.google.com/store",
    "https://books.google.com/", "https://scholar.google.com/", "https://earth.google.com/web", "https://classroom.google.com/",
    "https://www.blogger.com/", "https://myaccount.google.com/", "https://support.google.com/youtube",
    "https://fonts.googleapis.com/css2", "https://www.gstatic.com/x.js", "https://www.google.com/recaptcha/api.js",
  ]) assert.equal(check(url), null, url);
});

test("only Google's sign-in steps count as Google sign-in", () => {
  for (const url of ["https://accounts.google.com/", "https://accounts.google.com/o/oauth2/auth", "https://accounts.google.com/ServiceLogin?service=youtube",
    "https://accounts.google.com/AccountChooser", "https://accounts.google.com/gsi/client", "https://accounts.google.com/signup",
    "https://accounts.google.com/lifecycle/steps/signup/name"])
    assert.equal(check(url)?.kind, "googleSignIn", url);
  assert.equal(check("https://accounts.example.com/google"), null);
});
