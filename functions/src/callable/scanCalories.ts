import {GoogleAuth} from "google-auth-library";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../config/firebase";
import {logEvent} from "../services/eventService";

const VERTEX_LOCATION = "us-central1";
const VERTEX_MODEL = "gemini-2.5-flash";

interface ScanInput {
  /** Gambar JPEG base64 (tanpa prefix data:). */
  imageBase64?: string;
}

const PROMPT =
  "Kamu pakar pemakanan Malaysia. Analisis gambar makanan ini dan " +
  "balas HANYA JSON (tiada markdown) dengan bentuk: " +
  '{"foods":[{"name":"nama makanan bahasa Melayu","calories":anggaran ' +
  'kcal integer}],"totalCalories":integer,"totalProtein":anggaran gram ' +
  'protein integer,"totalCarbs":anggaran gram karbohidrat integer,' +
  '"totalFat":anggaran gram lemak integer,"isHealthy":boolean pilihan ' +
  'seimbang,"note":"satu ayat nasihat ringkas bahasa Melayu"}. ' +
  "Jika bukan makanan, balas " +
  '{"foods":[],"totalCalories":0,"totalProtein":0,"totalCarbs":0,' +
  '"totalFat":0,"isHealthy":false,"note":"Tiada makanan dikesan."}';

/**
 * 📸 Calorie Scan (Pro): analisis gambar makanan dengan
 * Vertex AI Gemini (guna service account projek - tiada API key).
 */
export const scanCalories = onCall(
  {timeoutSeconds: 60, memory: "512MiB"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sila log masuk dahulu.");
    }
    // Penguatkuasaan Pro di pelayan.
    const userSnap = await db.collection("users").doc(uid).get();
    const plan = (userSnap.data()?.plan as string | undefined) ?? "free";
    if (plan !== "pro") {
      return {status: "PRO_REQUIRED"};
    }

    const imageBase64 = ((request.data ?? {}) as ScanInput).imageBase64 ?? "";
    if (imageBase64.length === 0) {
      throw new HttpsError("invalid-argument", "Gambar diperlukan.");
    }
    if (imageBase64.length > 6 * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "Gambar terlalu besar.");
    }

    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const projectId = await auth.getProjectId();

    const url =
      `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
      `${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
      `${VERTEX_MODEL}:generateContent`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {text: PROMPT},
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          // 2.5-flash: matikan thinking supaya token tak habis
          // sebelum JSON penuh keluar.
          thinkingConfig: {thinkingBudget: 0},
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Vertex ${res.status}: ${body.slice(0, 500)}`);
      throw new HttpsError(
        "unavailable",
        "Analisis gagal. Cuba sebentar lagi.",
      );
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {parts?: Array<{text?: string}>};
      }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Bersihkan fence markdown + ambil objek JSON pertama sahaja.
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        start >= 0 && end > start ?
          cleaned.slice(start, end + 1) :
          cleaned,
      );
    } catch (e) {
      console.error("Gagal parse JSON Gemini:", cleaned.slice(0, 300));
      throw new HttpsError("internal", "Format analisis tidak dijangka.");
    }

    await logEvent({
      userId: uid,
      eventType: "calorie_scan",
      metadata: {},
    });

    return {status: "OK", result: parsed};
  },
);
