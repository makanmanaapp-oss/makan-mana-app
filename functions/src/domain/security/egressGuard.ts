/**
 * Pagar egress QA — keputusan TULEN, tiada I/O, tiada rahsia.
 *
 * MENGAPA INI WUJUD
 * -----------------
 * Emulator Functions berjalan pada mesin jurutera dengan **akses internet
 * penuh** dan dengan Application Default Credentials pemilik. Ia BOLEH
 * menghubungi Control Center produksi dan FCM produksi. Sebelum ini satu-satunya
 * perkara yang menghalangnya ialah **rahsia yang kebetulan tiada**, jadi satu
 * fail `.secret.local` yang tersilap diletakkan sudah cukup untuk membuka
 * laluan tulis ke produksi daripada larian QA.
 *
 * Modul ini menggantikan perlindungan kebetulan itu dengan keputusan yang
 * jelas. Ia TIDAK membaca rahsia, jadi membekalkan rahsia — betul, palsu atau
 * tersilap — tidak boleh memintasnya.
 *
 * REKA BENTUK
 * -----------
 * Dua isyarat sahaja, kedua-duanya ditetapkan oleh persekitaran dan bukan oleh
 * konfigurasi aplikasi:
 *
 *   - identiti projek (`GCLOUD_PROJECT` / `FIREBASE_CONFIG` / `GCP_PROJECT`);
 *   - `FUNCTIONS_EMULATOR`, yang ditetapkan oleh emulator dan TIADA dalam
 *     setiap persekitaran yang digunakan.
 *
 * Projek QA yang diluluskan ialah `demo-makanmana-qa`. Firebase memperlakukan
 * setiap awalan `demo-` sebagai projek tempatan yang tidak wujud di hulu, jadi
 * awalan itu — bukan satu nama sahaja — ialah penanda QA.
 */

/** Awalan projek yang Firebase sendiri anggap tempatan-sahaja. */
export const QA_PROJECT_PREFIX = "demo-";

/** Projek QA yang DILULUSKAN untuk QA peranti terpencil. */
export const APPROVED_QA_PROJECT_ID = "demo-makanmana-qa";

/** Operasi luaran yang dilindungi. */
export type EgressKind =
  | "control_center_mirror"
  | "fcm_push"
  | "app_store_api";

export interface EgressEnvironment {
  /** Identiti projek, atau null jika ia tidak dapat ditentukan langsung. */
  projectId: string | null;
  /** Benar apabila proses berjalan di dalam emulator Functions. */
  inEmulator: boolean;
}

export interface EgressDecision {
  allowed: boolean;
  /**
   * Diagnostik selamat. TIDAK PERNAH mengandungi rahsia, token, kunci atau
   * kandungan kredensial — hanya identiti projek, mod emulator dan hos.
   */
  reason: string;
}

/** Hos yang dianggap gelung-balik — mesin yang sama dengan emulator. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Benar untuk mana-mana projek `demo-`, bukan hanya yang diluluskan. */
export function isQaProjectId(projectId: string | null): boolean {
  return projectId !== null && projectId.startsWith(QA_PROJECT_PREFIX);
}

/** Benar apabila URL menunjuk ke mesin tempatan. */
export function isLoopbackDestination(destination: string): boolean {
  try {
    const url = new URL(destination);
    return LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Selesaikan identiti projek daripada persekitaran.
 *
 * Cloud Functions yang digunakan sentiasa menetapkan `GCLOUD_PROJECT`, dan
 * Firebase menetapkan `FIREBASE_CONFIG`. Kedua-duanya mesti tiada sebelum
 * identiti dianggap tidak diketahui.
 */
export function readEgressEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EgressEnvironment {
  const direct = env.GCLOUD_PROJECT ?? env.GCP_PROJECT ?? "";
  let projectId = direct.trim();
  if (!projectId && env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(env.FIREBASE_CONFIG) as {projectId?: unknown};
      if (typeof parsed.projectId === "string") projectId = parsed.projectId.trim();
    } catch {
      // FIREBASE_CONFIG cacat — biarkan identiti tidak diketahui dan gagal tertutup.
    }
  }
  return {
    projectId: projectId.length > 0 ? projectId : null,
    inEmulator: env.FUNCTIONS_EMULATOR === "true",
  };
}

/**
 * Tentukan sama ada satu operasi luaran dibenarkan.
 *
 * Matriksnya sengaja lengkap — setiap gabungan identiti projek dan mod emulator
 * mempunyai keputusan yang dinyatakan, supaya tiada keadaan jatuh melalui
 * secara senyap ke "dibenarkan".
 */
export function decideEgress(params: {
  kind: EgressKind;
  /** Hanya untuk `control_center_mirror`. */
  destination?: string;
  env?: EgressEnvironment;
}): EgressDecision {
  const env = params.env ?? readEgressEnvironment();
  const {projectId, inEmulator} = env;
  const qaProject = isQaProjectId(projectId);
  const where = `project=${projectId ?? "<tidak diketahui>"} emulator=${inEmulator}`;

  // 1. Identiti tidak diketahui — tidak boleh membuktikan ini bukan QA.
  if (projectId === null) {
    return {
      allowed: false,
      reason:
        `Egress ${params.kind} DISEKAT: identiti projek tidak dapat ditentukan ` +
        "(GCLOUD_PROJECT, GCP_PROJECT dan FIREBASE_CONFIG semuanya tiada). " +
        "Pagar gagal-tertutup dan bukan mengandaikan produksi.",
    };
  }

  // 2. Percanggahan: emulator menjalankan projek SEBENAR. Inilah keadaan yang
  //    diamarankan oleh mesej Application Default Credentials.
  if (inEmulator && !qaProject) {
    return {
      allowed: false,
      reason:
        `Egress ${params.kind} DISEKAT: emulator sedang menjalankan projek ` +
        `bukan-QA (${where}). Larian terpencil mesti menggunakan projek ` +
        `\`${QA_PROJECT_PREFIX}\`, contohnya ${APPROVED_QA_PROJECT_ID}.`,
    };
  }

  // 3. Percanggahan: projek QA di luar emulator. Sesuatu yang digunakan tidak
  //    sepatutnya membawa identiti `demo-`.
  if (!inEmulator && qaProject) {
    return {
      allowed: false,
      reason:
        `Egress ${params.kind} DISEKAT: projek QA di luar emulator (${where}). ` +
        "Identiti dan mod tidak sepadan, jadi tiada destinasi boleh dipercayai.",
    };
  }

  // 4. Proses QA tulen: projek `demo-` DAN di dalam emulator.
  if (qaProject && inEmulator) {
    // HANYA cermin Control Center mempunyai setara gelung-balik. Setiap
    // perkhidmatan luaran yang lain (FCM, App Store Server API) tiada emulator,
    // jadi panggilan dari QA akan keluar SEBENAR menggunakan kredensial
    // pemilik. Disekat mengikut jenis, bukan mengikut destinasi.
    if (params.kind !== "control_center_mirror") {
      return {
        allowed: false,
        reason:
          `Egress ${params.kind} DISEKAT: perkhidmatan ini tiada emulator, ` +
          `jadi panggilan dari larian QA akan keluar sebenar (${where}).`,
      };
    }
    const destination = params.destination ?? "";
    if (isLoopbackDestination(destination)) {
      return {allowed: true, reason: `Egress QA ke gelung-balik dibenarkan (${where}).`};
    }
    return {
      allowed: false,
      reason:
        `Egress ${params.kind} DISEKAT: larian QA tidak boleh menghubungi ` +
        `destinasi bukan-gelung-balik (${where}).`,
    };
  }

  // 5. Proses produksi: projek sebenar, bukan emulator. Tingkah laku KEKAL.
  return {allowed: true, reason: `Egress produksi dibenarkan (${where}).`};
}
