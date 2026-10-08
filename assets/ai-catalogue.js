// Antara AI catalogue. A plain list of AI tools and the words they show up under
// in expense exports, card statements, single sign-on app lists and extension lists.
//
// How matching works (see records-scan.js): each phrase is a run of whole words.
// A row matches a tool only if one of its phrases appears as whole words, so a
// person called Claude or a crypto exchange called Gemini never matches by name alone.
// "unless" lists phrases that stop a tool matching, so one row is not counted twice.
//
// This list goes out of date. CATALOGUE_VERSION says how old it is, and the page shows it.
// Add tools by adding an entry. Keep phrases specific: when in doubt, leave a bare common word out.

export const CATALOGUE_VERSION = "2026-10";

export const CATEGORIES = {
  assistant: {
    label: "General AI assistants",
    note: "People paste in whatever they are working on. What matters is whose account it is (company or personal) and what gets pasted.",
  },
  meeting: {
    label: "Meeting recorders and note-takers",
    note: "These capture everything said and everyone present, including people who never agreed to be recorded.",
  },
  coding: {
    label: "Coding assistants",
    note: "Source code, and sometimes the secrets sitting near it, goes to a third party.",
  },
  writing: {
    label: "Writing and translation tools",
    note: "They see whole documents, often drafts of contracts, customer letters or board papers.",
  },
  media: {
    label: "Image, video and voice generators",
    note: "Synthetic content raises disclosure and copyright questions. Ensign covers the disclosure side.",
  },
  research: {
    label: "AI search and research tools",
    note: "Uploaded files and questions leave the organisation. Answers can sound sure and be wrong.",
  },
  platform: {
    label: "Model platforms and developer tools",
    note: "Someone is building with AI. That usually means pipelines or agents that nobody has listed.",
  },
  agents: {
    label: "Automation and agent builders",
    note: "These can act on your systems with no person in between. Sentinel covers what an agent can cause.",
  },
  vertical: {
    label: "Industry-specific AI tools",
    note: "Legal, health and finance tools see the most sensitive material the organisation holds.",
  },
  customer: {
    label: "Customer-facing AI",
    note: "This speaks for the organisation to customers, so a wrong answer is a public one.",
  },
  embedded: {
    label: "AI features inside software you already use",
    note: "The tool itself is not an AI product, but it now ships AI features. Whether they are switched on, and what they can see, depends on your settings.",
  },
};

// phrases are written as they would appear after the scanner lowercases a row and
// turns every punctuation mark into a space ("otter.ai" becomes "otter ai").
export const AI_TOOLS = [
  // ---- general assistants ----
  { id: "chatgpt", name: "ChatGPT / OpenAI", vendor: "OpenAI", category: "assistant", personalAccountsCommon: true,
    phrases: ["chatgpt", "openai", "chat gpt"], unless: ["azure openai"] },
  { id: "claude", name: "Claude", vendor: "Anthropic", category: "assistant", personalAccountsCommon: true,
    phrases: ["anthropic", "claude ai", "claude pro", "claude max", "claude team", "claude code"] },
  { id: "gemini", name: "Gemini", vendor: "Google", category: "assistant", personalAccountsCommon: true,
    phrases: ["google gemini", "gemini advanced", "google ai pro", "google ai ultra", "google one ai premium", "gemini app"] },
  { id: "msft-copilot", name: "Microsoft Copilot", vendor: "Microsoft", category: "assistant", personalAccountsCommon: true,
    phrases: ["microsoft 365 copilot", "microsoft copilot", "copilot pro", "m365 copilot"] },
  { id: "grok", name: "Grok", vendor: "xAI", category: "assistant", personalAccountsCommon: true,
    phrases: ["grok ai", "supergrok", "xai grok"] },
  { id: "deepseek", name: "DeepSeek", vendor: "DeepSeek", category: "assistant", personalAccountsCommon: true,
    phrases: ["deepseek"] },
  { id: "mistral", name: "Mistral", vendor: "Mistral AI", category: "assistant", personalAccountsCommon: true,
    phrases: ["mistral ai"] },
  { id: "kimi", name: "Kimi", vendor: "Moonshot AI", category: "assistant", personalAccountsCommon: true,
    phrases: ["moonshot ai", "kimi ai"] },
  { id: "poe", name: "Poe", vendor: "Quora", category: "assistant", personalAccountsCommon: true,
    phrases: ["quora poe", "poe com"] },
  { id: "character", name: "Character.AI", vendor: "Character Technologies", category: "assistant", personalAccountsCommon: true,
    phrases: ["character ai", "characterai"] },

  // ---- meeting recorders ----
  { id: "otter", name: "Otter.ai", vendor: "Otter.ai", category: "meeting", phrases: ["otter ai"] },
  { id: "fireflies", name: "Fireflies.ai", vendor: "Fireflies", category: "meeting", phrases: ["fireflies ai", "fireflies com"] },
  { id: "fathom", name: "Fathom", vendor: "Fathom", category: "meeting", phrases: ["fathom video", "fathom ai"] },
  { id: "read-ai", name: "Read AI", vendor: "Read AI", category: "meeting", phrases: ["read ai"] },
  { id: "tldv", name: "tl;dv", vendor: "tl;dv", category: "meeting", phrases: ["tldv", "tl dv"] },
  { id: "granola", name: "Granola", vendor: "Granola", category: "meeting", phrases: ["granola ai", "granola so"] },
  { id: "krisp", name: "Krisp", vendor: "Krisp", category: "meeting", phrases: ["krisp"] },
  { id: "avoma", name: "Avoma", vendor: "Avoma", category: "meeting", phrases: ["avoma"] },
  { id: "gong", name: "Gong", vendor: "Gong", category: "meeting", phrases: ["gong io"] },

  // ---- coding ----
  { id: "github-copilot", name: "GitHub Copilot", vendor: "GitHub / Microsoft", category: "coding", personalAccountsCommon: true,
    phrases: ["github copilot"] },
  { id: "cursor", name: "Cursor", vendor: "Anysphere", category: "coding", personalAccountsCommon: true,
    phrases: ["anysphere", "cursor ai", "cursor com"] },
  { id: "windsurf", name: "Windsurf / Codeium", vendor: "Codeium", category: "coding", personalAccountsCommon: true,
    phrases: ["codeium", "windsurf ai"] },
  { id: "replit", name: "Replit", vendor: "Replit", category: "coding", personalAccountsCommon: true, phrases: ["replit"] },
  { id: "lovable", name: "Lovable", vendor: "Lovable", category: "coding", personalAccountsCommon: true,
    phrases: ["lovable dev", "lovable labs", "lovable ai"] },
  { id: "bolt", name: "Bolt.new", vendor: "StackBlitz", category: "coding", personalAccountsCommon: true,
    phrases: ["bolt new", "stackblitz"] },
  { id: "tabnine", name: "Tabnine", vendor: "Tabnine", category: "coding", phrases: ["tabnine"] },
  { id: "amazon-q", name: "Amazon Q Developer", vendor: "Amazon", category: "coding",
    phrases: ["amazon q developer", "codewhisperer"] },
  { id: "jetbrains-ai", name: "JetBrains AI", vendor: "JetBrains", category: "coding", phrases: ["jetbrains ai"] },
  { id: "devin", name: "Devin", vendor: "Cognition", category: "coding", phrases: ["cognition ai", "devin ai"] },

  // ---- writing and translation ----
  { id: "grammarly", name: "Grammarly", vendor: "Grammarly", category: "writing", personalAccountsCommon: true, phrases: ["grammarly"] },
  { id: "jasper", name: "Jasper", vendor: "Jasper", category: "writing", phrases: ["jasper ai"] },
  { id: "copyai", name: "Copy.ai", vendor: "Copy.ai", category: "writing", phrases: ["copy ai"] },
  { id: "writesonic", name: "Writesonic", vendor: "Writesonic", category: "writing", phrases: ["writesonic"] },
  { id: "wordtune", name: "Wordtune / AI21", vendor: "AI21 Labs", category: "writing", phrases: ["wordtune", "ai21"] },
  { id: "quillbot", name: "QuillBot", vendor: "QuillBot", category: "writing", personalAccountsCommon: true, phrases: ["quillbot"] },
  { id: "deepl", name: "DeepL", vendor: "DeepL", category: "writing", personalAccountsCommon: true, phrases: ["deepl"] },
  { id: "notion-ai", name: "Notion AI", vendor: "Notion", category: "writing", phrases: ["notion ai"] },

  // ---- images, video, voice ----
  { id: "midjourney", name: "Midjourney", vendor: "Midjourney", category: "media", personalAccountsCommon: true, phrases: ["midjourney"] },
  { id: "firefly", name: "Adobe Firefly", vendor: "Adobe", category: "media", phrases: ["adobe firefly"] },
  { id: "leonardo", name: "Leonardo.ai", vendor: "Leonardo", category: "media", personalAccountsCommon: true, phrases: ["leonardo ai"] },
  { id: "stability", name: "Stability AI", vendor: "Stability AI", category: "media", phrases: ["stability ai", "dreamstudio"] },
  { id: "ideogram", name: "Ideogram", vendor: "Ideogram", category: "media", personalAccountsCommon: true, phrases: ["ideogram"] },
  { id: "runway", name: "Runway", vendor: "Runway", category: "media", phrases: ["runway ml", "runwayml"] },
  { id: "pika", name: "Pika", vendor: "Pika", category: "media", phrases: ["pika art"] },
  { id: "luma", name: "Luma AI", vendor: "Luma", category: "media", phrases: ["luma ai", "lumalabs"] },
  { id: "kling", name: "Kling", vendor: "Kuaishou", category: "media", personalAccountsCommon: true, phrases: ["kling ai"] },
  { id: "elevenlabs", name: "ElevenLabs", vendor: "ElevenLabs", category: "media", phrases: ["elevenlabs", "eleven labs"] },
  { id: "heygen", name: "HeyGen", vendor: "HeyGen", category: "media", phrases: ["heygen"] },
  { id: "synthesia", name: "Synthesia", vendor: "Synthesia", category: "media", phrases: ["synthesia"] },
  { id: "descript", name: "Descript", vendor: "Descript", category: "media", phrases: ["descript"] },
  { id: "suno", name: "Suno", vendor: "Suno", category: "media", personalAccountsCommon: true, phrases: ["suno ai", "suno com"] },
  { id: "photoroom", name: "Photoroom", vendor: "Photoroom", category: "media", phrases: ["photoroom"] },
  { id: "gamma", name: "Gamma", vendor: "Gamma", category: "media", personalAccountsCommon: true, phrases: ["gamma app"] },
  { id: "beautiful-ai", name: "Beautiful.ai", vendor: "Beautiful.ai", category: "media", phrases: ["beautiful ai"] },

  // ---- search and research ----
  { id: "perplexity", name: "Perplexity", vendor: "Perplexity", category: "research", personalAccountsCommon: true, phrases: ["perplexity"] },
  { id: "notebooklm", name: "NotebookLM", vendor: "Google", category: "research", personalAccountsCommon: true, phrases: ["notebooklm", "notebook lm"] },
  { id: "chatpdf", name: "ChatPDF", vendor: "ChatPDF", category: "research", personalAccountsCommon: true, phrases: ["chatpdf"] },
  { id: "elicit", name: "Elicit", vendor: "Elicit", category: "research", phrases: ["elicit org"] },
  { id: "glean", name: "Glean", vendor: "Glean", category: "research", phrases: ["glean technologies"] },

  // ---- model platforms ----
  { id: "azure-openai", name: "Azure OpenAI", vendor: "Microsoft", category: "platform", phrases: ["azure openai", "azure ai foundry", "azure ai studio"] },
  { id: "bedrock", name: "Amazon Bedrock", vendor: "Amazon", category: "platform", phrases: ["amazon bedrock", "aws bedrock"] },
  { id: "vertex", name: "Google Vertex AI", vendor: "Google", category: "platform", phrases: ["vertex ai"] },
  { id: "huggingface", name: "Hugging Face", vendor: "Hugging Face", category: "platform", phrases: ["hugging face", "huggingface"] },
  { id: "together", name: "Together AI", vendor: "Together", category: "platform", phrases: ["together ai"] },
  { id: "groq", name: "Groq", vendor: "Groq", category: "platform", phrases: ["groq"] },
  { id: "langchain", name: "LangChain / LangSmith", vendor: "LangChain", category: "platform", phrases: ["langchain", "langsmith"] },
  { id: "weights", name: "Weights & Biases", vendor: "Weights & Biases", category: "platform", phrases: ["weights biases", "wandb"] },

  // ---- automation and agents ----
  { id: "copilot-studio", name: "Microsoft Copilot Studio", vendor: "Microsoft", category: "agents", phrases: ["copilot studio"] },
  { id: "zapier", name: "Zapier", vendor: "Zapier", category: "agents", phrases: ["zapier"] },
  { id: "make", name: "Make", vendor: "Make", category: "agents", phrases: ["make com", "integromat"] },
  { id: "n8n", name: "n8n", vendor: "n8n", category: "agents", phrases: ["n8n"] },
  { id: "agentforce", name: "Salesforce Agentforce", vendor: "Salesforce", category: "agents", phrases: ["agentforce"] },
  { id: "now-assist", name: "ServiceNow Now Assist", vendor: "ServiceNow", category: "agents", phrases: ["now assist"] },
  { id: "relevance", name: "Relevance AI", vendor: "Relevance AI", category: "agents", phrases: ["relevance ai"] },
  { id: "lindy", name: "Lindy", vendor: "Lindy", category: "agents", phrases: ["lindy ai"] },
  { id: "gumloop", name: "Gumloop", vendor: "Gumloop", category: "agents", phrases: ["gumloop"] },
  { id: "voiceflow", name: "Voiceflow", vendor: "Voiceflow", category: "agents", phrases: ["voiceflow"] },
  { id: "botpress", name: "Botpress", vendor: "Botpress", category: "agents", phrases: ["botpress"] },
  { id: "dify", name: "Dify", vendor: "Dify", category: "agents", phrases: ["dify ai"] },

  // ---- industry specific ----
  { id: "harvey", name: "Harvey", vendor: "Harvey", category: "vertical", phrases: ["harvey ai"] },
  { id: "cocounsel", name: "CoCounsel", vendor: "Thomson Reuters", category: "vertical", phrases: ["cocounsel"] },
  { id: "hebbia", name: "Hebbia", vendor: "Hebbia", category: "vertical", phrases: ["hebbia"] },
  { id: "heidi", name: "Heidi Health", vendor: "Heidi", category: "vertical", phrases: ["heidi health"] },
  { id: "abridge", name: "Abridge", vendor: "Abridge", category: "vertical", phrases: ["abridge ai", "abridge inc"] },
  { id: "dax", name: "Nuance DAX / Dragon Copilot", vendor: "Microsoft", category: "vertical", phrases: ["nuance dax", "dragon copilot"] },
  { id: "tortus", name: "Tortus", vendor: "Tortus", category: "vertical", phrases: ["tortus ai"] },

  // ---- customer facing ----
  { id: "intercom-fin", name: "Intercom Fin", vendor: "Intercom", category: "customer", phrases: ["intercom fin", "fin ai"] },
  { id: "decagon", name: "Decagon", vendor: "Decagon", category: "customer", phrases: ["decagon ai"] },
  { id: "sierra", name: "Sierra", vendor: "Sierra", category: "customer", phrases: ["sierra ai"] },

  // ---- ordinary software that now ships AI features ----
  { id: "e-canva", name: "Canva", vendor: "Canva", category: "embedded", phrases: ["canva"] },
  { id: "e-notion", name: "Notion", vendor: "Notion", category: "embedded", phrases: ["notion labs"], unless: ["notion ai"] },
  { id: "e-zoom", name: "Zoom", vendor: "Zoom", category: "embedded", phrases: ["zoom us", "zoom video"], unless: ["zoom ai companion"] },
  { id: "e-slack", name: "Slack", vendor: "Salesforce", category: "embedded", phrases: ["slack technologies", "slack com"] },
  { id: "e-atlassian", name: "Atlassian", vendor: "Atlassian", category: "embedded", phrases: ["atlassian"] },
  { id: "e-hubspot", name: "HubSpot", vendor: "HubSpot", category: "embedded", phrases: ["hubspot"] },
  { id: "e-salesforce", name: "Salesforce", vendor: "Salesforce", category: "embedded", phrases: ["salesforce"], unless: ["agentforce"] },
  { id: "e-adobe", name: "Adobe Creative Cloud", vendor: "Adobe", category: "embedded", phrases: ["adobe creative cloud", "adobe acrobat"], unless: ["adobe firefly"] },
  { id: "e-zoominfo", name: "ZoomInfo", vendor: "ZoomInfo", category: "embedded", phrases: ["zoominfo"] },
  { id: "e-dropbox", name: "Dropbox", vendor: "Dropbox", category: "embedded", phrases: ["dropbox"] },
  { id: "e-workspace", name: "Google Workspace", vendor: "Google", category: "embedded", phrases: ["google workspace"] },
  { id: "e-m365", name: "Microsoft 365", vendor: "Microsoft", category: "embedded", phrases: ["microsoft 365", "office 365"],
    unless: ["microsoft 365 copilot", "m365 copilot"] },
];
