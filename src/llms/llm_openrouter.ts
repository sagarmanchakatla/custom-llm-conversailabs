import Portkey from "portkey-ai";
import { trace } from "@opentelemetry/api";
import { WebSocket } from "ws";
import {
  CustomLlmRequest,
  CustomLlmResponse,
  ResponseRequiredRequest,
  ReminderRequiredRequest,
  Utterance,
} from "../types";

const beginSentence =
  "Hey there, I'm your personal AI therapist, how can I help you?";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY!,
  virtualKey: process.env.OPENROUTER_VIRTUAL_KEY!,
});

const tracer = trace.getTracer(process.env.PORTKEY_SERVICE_NAME!);

const agentPrompt =
  "Task: As a professional therapist, your responsibilities are comprehensive and patient-centered. You establish a positive and trusting rapport with patients, diagnosing and treating mental health disorders. Your role involves creating tailored treatment plans based on individual patient needs and circumstances. Regular meetings with patients are essential for providing counseling and treatment, and for adjusting plans as needed. You conduct ongoing assessments to monitor patient progress, involve and advise family members when appropriate, and refer patients to external specialists or agencies if required. Keeping thorough records of patient interactions and progress is crucial. You also adhere to all safety protocols and maintain strict client confidentiality. Additionally, you contribute to the practice's overall success by completing related tasks as needed.\n\nConversational Style: Communicate concisely and conversationally. Aim for responses in short, clear prose, ideally under 10 words. This succinct approach helps in maintaining clarity and focus during patient interactions.\n\nPersonality: Your approach should be empathetic and understanding, balancing compassion with maintaining a professional stance on what is best for the patient. It's important to listen actively and empathize without overly agreeing with the patient, ensuring that your professional opinion guides the therapeutic process.";

export class DemoLlmClient {
  BeginMessage(ws: WebSocket) {
    const res: CustomLlmResponse = {
      response_type: "response",
      response_id: 0,
      content: beginSentence,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  private conversationToMessages(conversation: Utterance[]) {
    return conversation.map((turn) => ({
      role: turn.role === "agent" ? "assistant" : "user",
      content: turn.content,
    }));
  }

  private preparePrompt(
    request: ResponseRequiredRequest | ReminderRequiredRequest
  ) {
    const transcript = this.conversationToMessages(request.transcript);
    const msgs = [
      {
        role: "system",
        content:
          "##Objective\nYou are a voice AI agent engaging in a human-like conversation…\n\n##Role\n…Task: As a professional therapist, your responsibilities are comprehensive and patient-centered. You establish a positive and trusting rapport with patients, diagnosing and treating mental health disorders. Your role involves creating tailored treatment plans based on individual patient needs and circumstances. Regular meetings with patients are essential for providing counseling and treatment, and for adjusting plans as needed. You conduct ongoing assessments to monitor patient progress, involve and advise family members when appropriate, and refer patients to external specialists or agencies if required. Keeping thorough records of patient interactions and progress is crucial. You also adhere to all safety protocols and maintain strict client confidentiality. Additionally, you contribute to the practice's overall success by completing related tasks as needed.\n\nConversational Style: Communicate concisely and conversationally. Aim for responses in short, clear prose, ideally under 10 words. This succinct approach helps in maintaining clarity and focus during patient interactions.\n\nPersonality: Your approach should be empathetic and understanding, balancing compassion with maintaining a professional stance on what is best for the patient. It's important to listen actively and empathize without overly agreeing with the patient, ensuring that your professional opinion guides the therapeutic process." +
          agentPrompt,
      },
      ...transcript,
    ];

    if (request.interaction_type === "reminder_required") {
      msgs.push({
        role: "user",
        content:
          "(User hasn’t replied for a while — please prompt them again.)",
      });
    }

    return msgs;
  }

  async DraftResponse(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket
  ) {
    const span = tracer.startSpan("openrouter.chat.completions", {
      attributes: {
        "model.id": "mistralai/mixtral-8x7b-instruct",
        "llm.temperature": 0.9,
        "llm.max_tokens": 200,
      },
    });

    try {
      const events = await portkey.chat.completions.create({
        model: "mistralai/mixtral-8x7b-instruct",
        messages: this.preparePrompt(request),
        stream: true,
        temperature: 0.9,
        frequency_penalty: 0.7,
        presence_penalty: 0.7,
        max_tokens: 200,
        top_p: 1,
      });

      for await (const event of events) {
        const raw = event.choices[0]?.delta?.content;
        const delta = Array.isArray(raw) ? raw.join("") : raw ?? "";
        if (!delta) continue;

        const chunk: CustomLlmResponse = {
          response_type: "response",
          response_id: request.response_id,
          content: delta,
          content_complete: false,
          end_call: false,
        };
        console.log(chunk);
        ws.send(JSON.stringify(chunk));
      }
    } catch (err: any) {
      span.recordException(err);
      console.error("Portkey/OpenRouter error:", err);
    } finally {
      span.end();
      const endChunk: CustomLlmResponse = {
        response_type: "response",
        response_id: request.response_id,
        content: "",
        content_complete: true,
        end_call: false,
      };
      ws.send(JSON.stringify(endChunk));
    }
  }
}
