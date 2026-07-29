import { env } from "./env";

interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Call OpenRouter API
async function callOpenRouter(
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<AIResponse> {
  if (!env.OPENROUTER_API_KEY) {
    return {
      content: "AI service is not configured. Please set the OPENROUTER_API_KEY environment variable.",
      model: options?.model || env.OPENROUTER_MODEL,
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.BASE_URL,
      "X-Title": "JobTrack Pro",
    },
    body: JSON.stringify({
      model: options?.model || env.OPENROUTER_MODEL,
      messages,
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "No response from AI",
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

// Natural language search for jobs
export async function naturalLanguageSearch(
  query: string,
  context: { jobs?: any[]; customers?: any[]; dispatches?: any[] }
): Promise<string> {
  const systemPrompt = `You are JobTrack Pro AI assistant. You help users find information about jobs, customers, and dispatches.
  
Available data:
- Jobs: ${context.jobs?.length || 0} jobs
- Customers: ${context.customers?.length || 0} customers
- Dispatches: ${context.dispatches?.length || 0} dispatches

When answering:
- Be concise and direct
- Reference specific job numbers, customer names
- Use tabular format when comparing multiple items
- If you don't have enough data, say so clearly`;

  const contextData: string[] = [];

  if (context.jobs?.length) {
    contextData.push(
      "JOBS:\n" +
        context.jobs
          .slice(0, 20)
          .map(
            (j) =>
              `- ${j.jobNumber}: ${j.customerName || "Unknown"} | ${j.material || "-"} | Qty: ${j.quantity} | Status: ${j.status} | Priority: ${j.priority}`
          )
          .join("\n")
    );
  }

  if (context.customers?.length) {
    contextData.push(
      "CUSTOMERS:\n" +
        context.customers
          .slice(0, 20)
          .map((c) => `- ${c.companyName}: ${c.industry || "N/A"} | Jobs: ${c.totalJobs || 0}`)
          .join("\n")
    );
  }

  if (context.dispatches?.length) {
    contextData.push(
      "DISPATCHES:\n" +
        context.dispatches
          .slice(0, 20)
          .map(
            (d) =>
              `- ${d.dispatchNumber}: Job ${d.jobNumber || "-"} | Qty: ${d.quantityDispatched} | Status: ${d.status}`
          )
          .join("\n")
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Context data:\n${contextData.join("\n\n")}\n\nUser query: ${query}`,
    },
  ];

  const response = await callOpenRouter(messages, { temperature: 0.3 });
  return response.content;
}

// Generate job summary
export async function generateJobSummary(job: any, timeline: any[], qualityChecks: any[]): Promise<string> {
  const systemPrompt = `You are a production report assistant. Generate a concise summary of the job status.`;

  const timelineText = timeline
    .map((t) => `- ${new Date(t.createdAt).toLocaleDateString()}: ${t.description}`)
    .join("\n");

  const qualityText = qualityChecks
    .map((q) => `- ${q.checkType}: ${q.status} ${q.defectsFound ? `(${q.defectsFound} defects)` : ""}`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Job: ${job.jobNumber}
Customer: ${job.customerName || "Unknown"}
Material: ${job.material || "N/A"}
Quantity: ${job.quantity} ${job.unit}
Status: ${job.status}
Priority: ${job.priority}
Due Date: ${job.dueDate ? new Date(job.dueDate).toLocaleDateString() : "Not set"}

Timeline:
${timelineText || "No timeline entries"}

Quality Checks:
${qualityText || "No quality checks"}

Generate a brief summary of the job's current status, progress, and any issues.`,
    },
  ];

  const response = await callOpenRouter(messages, { temperature: 0.5, maxTokens: 500 });
  return response.content;
}

// Generate email content
export async function generateEmailContent(
  purpose: string,
  context: Record<string, any>
): Promise<{ subject: string; body: string }> {
  const systemPrompt = `You are an email composition assistant for JobTrack Pro, an industrial job tracking platform.
Generate professional emails based on the purpose and context provided.
Return the response in JSON format: { "subject": "...", "body": "..." }`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Purpose: ${purpose}\nContext: ${JSON.stringify(context, null, 2)}\n\nGenerate a professional email.`,
    },
  ];

  const response = await callOpenRouter(messages, { temperature: 0.7, maxTokens: 1000 });

  try {
    const parsed = JSON.parse(response.content);
    return { subject: parsed.subject, body: parsed.body };
  } catch {
    return {
      subject: `Regarding ${purpose}`,
      body: response.content,
    };
  }
}

// Smart suggestions
export async function getSmartSuggestions(context: {
  jobs?: any[];
  recentActivity?: any[];
  userQuery?: string;
}): Promise<string[]> {
  const systemPrompt = `You are a smart assistant. Based on the context, suggest 3-5 actionable next steps or insights.
Return suggestions as a JSON array of strings.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Context: ${JSON.stringify(context, null, 2)}\n\nProvide smart suggestions.`,
    },
  ];

  const response = await callOpenRouter(messages, { temperature: 0.5, maxTokens: 500 });

  try {
    const suggestions = JSON.parse(response.content);
    return Array.isArray(suggestions) ? suggestions : [response.content];
  } catch {
    return [response.content];
  }
}

// Report generation
export async function generateReportInsights(data: {
  reportType: string;
  data: any[];
  summary: Record<string, any>;
}): Promise<string> {
  const systemPrompt = `You are a data analyst for an industrial job tracking platform.
Generate insights and analysis based on the report data.
Focus on trends, issues, and actionable recommendations.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Report Type: ${data.reportType}
Summary: ${JSON.stringify(data.summary, null, 2)}
Data sample: ${JSON.stringify(data.data.slice(0, 10), null, 2)}

Generate insights and recommendations.`,
    },
  ];

  const response = await callOpenRouter(messages, { temperature: 0.5, maxTokens: 1500 });
  return response.content;
}

// Chat completion
export async function chat(
  messages: ChatMessage[],
  options?: { model?: string; maxTokens?: number }
): Promise<string> {
  const response = await callOpenRouter(messages, options);
  return response.content;
}
