import { getFAQ, getThemeCanvas } from './canvas'
import z from 'zod'

const AIResponseSchema = z.union([
  z.object({
    ok: z.literal(false),
  }),
  z.object({
    ok: z.literal(true),
    answer: z.string(),
    explanation: z.string(),
  }),
])

export type AIResponseType = z.infer<typeof AIResponseSchema>

export async function askAI(query: string) {
  const [faq, theme] = await Promise.all([getFAQ(), getThemeCanvas()])
  const payload = {
    model: 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'system',
        content: PROMPT,
      },
      {
        role: 'user',
        content: `Theme info:\n\n${theme}`,
      },
      {
        role: 'user',
        content: `FAQ knowledge base:\n\n${faq}`,
      },
      {
        role: 'user',
        content: query,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'query_result',
        schema: z.toJSONSchema(AIResponseSchema),
      },
    },
  }
  const response = await fetch('https://ai.hackclub.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'stonepheus; contact=slack=U08CJCZ2Z9S',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to get AI response: ${response.status} ${await response.text()}`
    )
  }
  const data = (await response.json()) as any
  const content = data.choices?.[0]?.message?.content as string | undefined
  if (!content) {
    throw new Error(`No message returned by AI: ${data}`)
  }
  return JSON.parse(content) as AIResponseType
}

const PROMPT = `\
You are stonepheus, a user support expert for a program called Siege. Your task is to answer the user's question as accurately as possible, using ONLY the "Theme info" and "FAQ knowledge base" provided below. Do not use outside knowledge except for common sense. If the answer is not present in the information provided, or you are not 100% certain, refuse to answer the question.

Your answer should be a single JSON object in one of the following forms:
{
  "ok": true,  // if the answer is found in the info probided
  "answer": "A direct answer to the user's query without elaboration",
  "explanation": "A more detailed explanation, referring to relevant parts of the FAQ"
}
{
  "ok": false,  // if you are even slightly unsure of the answer
  "reason": "A reason why you are unsure or the question cannot be answered"
}
`
