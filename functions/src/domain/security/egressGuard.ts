/**
 * Pagar egress — keputusan TULEN, tiada I/O, tiada rahsia.
 *
 * MENGAPA INI WUJUD
 * -----------------
 * Emulator Functions berjalan pada mesin jurutera dengan **akses internet
 * penuh** dan dengan Application Default Credentials pemilik. Ia BOLEH
 * menghubungi Control Center produksi dan FCM produksi. Sebelum ini
 * satu-satunya perkara yang menghalangnya ialah **rahsia yang kebetulan
 * tiada**, jadi satu fail `.secret.local` yang tersilap diletakkan sudah cukup
 * untuk membuka laluan tulis ke produksi daripada larian QA.
 *
 * Modul ini TIDAK membaca rahsia. Membekalkan rahsia — betul, palsu atau
 * tersilap — tidak boleh memintasnya. Kredensial tidak pernah mengatasi
 * keputusan yang ditolak.
 *
 * WAVE 3C — IDENTITI EKSPLISIT
 * ----------------------------
 * Sebelum ini "produksi" bermaksud *apa-apa yang bukan `demo-`*. Itu
 * menjadikan projek yang tidak dikenali — salah taip, projek peribadi
 * jurutera, persekitaran yang separuh disediakan — DIBENARKAN secara senyap
 * dengan keistimewaan penuh produksi.
 *
 * Kini setiap identiti diklasifikasikan secara eksplisit, dan apa-apa yang
 * tidak dikenali GAGAL-TERTUTUP. Satu projek tidak menjadi QA kerana namanya
 * mengandungi "qa" atau "test", atau kerana ia berbeza daripada produksi.
 */

/** Projek Firebase produksi. Disahkan dalam firebase_options.dart dan google-services.json. */
export const PRODUCTION_PROJECT_ID = "makanmana-c59f3";

/**
 * Awalan yang Firebase sendiri anggap tempatan-sahaja.
 *
 * Ini BUKAN heuristik nama. Firebase memperlakukan setiap projek `demo-`
 * sebagai tidak wujud di hulu — SDK tidak boleh mencapai backend sebenar
 * dengannya. Awalan itu ialah jaminan platform, bukan konvensyen penamaan.
 */
export const QA_PROJECT_PREFIX = "demo-";

/** Projek QA emulator tempatan yang DILULUSKAN. */
export const APPROVED_QA_PROJECT_ID = "demo-makanmana-qa";

/**
 * Projek Firebase QA SEBENAR yang diluluskan pemilik untuk QA iPhone fizikal.
 *
 * BELUM DIUMPUKKAN. Pemilik meluluskan pendekatan itu, tetapi projek belum
 * dicipta dan ID belum wujud. Ia sengaja `null`: sehingga ID sebenar
 * dikonfigurasikan di sini oleh perubahan sumber yang jelas, TIADA projek
 * boleh diklasifikasikan sebagai REAL_QA, dan setiap identiti sedemikian
 * jatuh kepada UNKNOWN dan disekat.
 *
 * Jangan reka nilai. Jangan terbitkan daripada nama.
 */
export const APPROVED_REAL_QA_PROJECT_ID: string | null = null;

/** Klasifikasi identiti projek. */
export type ProjectClass =
  | "PRODUCTION"
  | "LOCAL_EMULATOR_QA"
  | "REAL_QA"
  | "UNKNOWN";

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
  /**
   * Diisi apabila sumber identiti TIDAK BERSETUJU. Persekitaran yang
   * bercanggah tidak boleh dipercayai, jadi ia disekat dan bukan diselesaikan
   * mengikut keutamaan.
   */
  conflict?: string | null;
}

export interface EgressDecision {
  allowed: boolean;
  /**
   * Diagnostik selamat. TIDAK PERNAH mengandungi rahsia, token, kunci atau
   * kandungan kredensial — hanya identiti projek, mod emulator dan hos.
   */
  reason: string;
  /** Klasifikasi yang membawa kepada keputusan ini. */
  projectClass: ProjectClass;
}

/** Hos yang dianggap gelung-balik — mesin yang sama dengan emulator. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Klasifikasikan satu identiti projek.
 *
 * Padanan TEPAT untuk produksi dan REAL_QA. Hanya awalan `demo-` yang
 * dijamin-platform melayakkan QA emulator tempatan. Segala-galanya —
 * termasuk nama yang mengandungi "qa" atau "test" — ialah UNKNOWN.
 */
export function classifyProject(
  projectId: string | null,
  /**
   * Boleh disuntik SEMATA-MATA supaya laluan REAL_QA boleh diuji sebelum
   * projek sebenar wujud. Lalainya ialah pemalar, yang `null`, jadi pemanggil
   * produksi tidak boleh sampai ke REAL_QA secara tidak sengaja. Ia BUKAN
   * pintu belakang: ia tidak membaca persekitaran dan tidak boleh ditetapkan
   * daripada luar proses.
   */
  approvedRealQaProjectId: string | null = APPROVED_REAL_QA_PROJECT_ID,
): ProjectClass {
  if (projectId === null || projectId.length === 0) return "UNKNOWN";
  if (projectId === PRODUCTION_PROJECT_ID) return "PRODUCTION";
  if (
    approvedRealQaProjectId !== null &&
    projectId === approvedRealQaProjectId
  ) {
    return "REAL_QA";
  }
  if (projectId.startsWith(QA_PROJECT_PREFIX)) return "LOCAL_EMULATOR_QA";
  return "UNKNOWN";
}

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
 * Cloud Functions yang digunakan menetapkan `GCLOUD_PROJECT`, dan Firebase
 * menetapkan `FIREBASE_CONFIG`. Apabila LEBIH DARIPADA SATU sumber hadir dan
 * ia TIDAK BERSETUJU, persekitaran itu tidak koheren — mengambil yang pertama
 * bermakna memilih satu identiti dan mengabaikan bukti bertentangan. Itu
 * direkodkan sebagai percanggahan dan disekat.
 */
export function readEgressEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EgressEnvironment {
  const sources: Array<{name: string; value: string}> = [];

  const add = (name: string, raw: string | undefined): void => {
    const value = (raw ?? "").trim();
    if (value.length > 0) sources.push({name, value});
  };

  add("GCLOUD_PROJECT", env.GCLOUD_PROJECT);
  add("GCP_PROJECT", env.GCP_PROJECT);
  if (env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(env.FIREBASE_CONFIG) as {projectId?: unknown};
      if (typeof parsed.projectId === "string") {
        add("FIREBASE_CONFIG.projectId", parsed.projectId);
      }
    } catch {
      // FIREBASE_CONFIG cacat. Ia menyumbang TIADA identiti; jika tiada sumber
      // lain, identiti kekal tidak diketahui dan pagar gagal-tertutup.
    }
  }

  const inEmulator = env.FUNCTIONS_EMULATOR === "true";

  if (sources.length === 0) {
    return {projectId: null, inEmulator, conflict: null};
  }

  const distinct = [...new Set(sources.map((s) => s.value))];
  if (distinct.length > 1) {
    const detail = sources.map((s) => `${s.name}=${s.value}`).join(", ");
    return {
      projectId: null,
      inEmulator,
      conflict: `sumber identiti projek tidak bersetuju (${detail})`,
    };
  }

  return {projectId: distinct[0], inEmulator, conflict: null};
}

/**
 * Tentukan sama ada satu operasi luaran dibenarkan.
 *
 * Setiap gabungan klasifikasi dan mod emulator mempunyai keputusan yang
 * dinyatakan, supaya tiada keadaan jatuh melalui secara senyap ke
 * "dibenarkan".
 */
export function decideEgress(params: {
  kind: EgressKind;
  /** Hanya untuk `control_center_mirror`. */
  destination?: string;
  env?: EgressEnvironment;
  /** Lihat nota suntikan pada `classifyProject`. Ujian sahaja. */
  approvedRealQaProjectId?: string | null;
}): EgressDecision {
  const env = params.env ?? readEgressEnvironment();
  const {projectId, inEmulator} = env;
  const projectClass = classifyProject(
    projectId,
    params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID,
  );
  const where = `project=${projectId ?? "<tidak diketahui>"} emulator=${inEmulator}`;

  // 0. Persekitaran bercanggah. Ini didahulukan: apabila sumber tidak
  //    bersetuju, kita tidak tahu persekitaran mana yang sedang kita jalankan,
  //    jadi tiada keputusan seterusnya bermakna.
  if (env.conflict) {
    return {
      allowed: false,
      projectClass: "UNKNOWN",
      reason:
        `Egress ${params.kind} DISEKAT: ${env.conflict}. Persekitaran yang ` +
        "bercanggah tidak diselesaikan mengikut keutamaan — ia disekat.",
    };
  }

  switch (projectClass) {
    // 1. Identiti tidak diketahui atau tidak dikenali.
    case "UNKNOWN":
      return {
        allowed: false,
        projectClass,
        reason:
          `Egress ${params.kind} DISEKAT: identiti projek tidak dikenali ` +
          `(${where}). Hanya ${PRODUCTION_PROJECT_ID}, projek ` +
          `\`${QA_PROJECT_PREFIX}\` dan projek QA sebenar yang diluluskan ` +
          "secara eksplisit dikenali. Pagar gagal-tertutup dan bukan " +
          "mengandaikan produksi.",
      };

    // 2. Produksi.
    case "PRODUCTION":
      if (inEmulator) {
        // Inilah keadaan yang diamarankan oleh mesej Application Default
        // Credentials: emulator tempatan membawa identiti produksi.
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: emulator sedang menjalankan ` +
            `identiti PRODUKSI (${where}). Larian terpencil mesti ` +
            `menggunakan projek \`${QA_PROJECT_PREFIX}\`, contohnya ` +
            `${APPROVED_QA_PROJECT_ID}.`,
        };
      }
      // Produksi tulen. Tingkah laku KEKAL.
      return {
        allowed: true,
        projectClass,
        reason: `Egress produksi dibenarkan (${where}).`,
      };

    // 3. QA emulator tempatan.
    case "LOCAL_EMULATOR_QA": {
      if (!inEmulator) {
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: projek \`${QA_PROJECT_PREFIX}\` ` +
            `di luar emulator (${where}). Identiti dan mod tidak sepadan, ` +
            "jadi tiada destinasi boleh dipercayai.",
        };
      }
      // HANYA cermin Control Center mempunyai setara gelung-balik. Setiap
      // perkhidmatan luaran yang lain (FCM, App Store Server API) tiada
      // emulator, jadi panggilan dari QA akan keluar SEBENAR menggunakan
      // kredensial pemilik.
      if (params.kind !== "control_center_mirror") {
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: perkhidmatan ini tiada emulator, ` +
            `jadi panggilan dari larian QA akan keluar sebenar (${where}).`,
        };
      }
      if (isLoopbackDestination(params.destination ?? "")) {
        return {
          allowed: true,
          projectClass,
          reason: `Egress QA ke gelung-balik dibenarkan (${where}).`,
        };
      }
      return {
        allowed: false,
        projectClass,
        reason:
          `Egress ${params.kind} DISEKAT: larian QA tidak boleh menghubungi ` +
          `destinasi bukan-gelung-balik (${where}).`,
      };
    }

    // 4. Projek Firebase QA sebenar (QA iPhone fizikal).
    case "REAL_QA": {
      if (inEmulator) {
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: projek QA sebenar di dalam ` +
            `emulator (${where}). QA emulator mesti menggunakan projek ` +
            `\`${QA_PROJECT_PREFIX}\`; kedua-dua persekitaran itu berasingan ` +
            "dengan sengaja dan tidak boleh bercampur.",
        };
      }
      switch (params.kind) {
        case "control_center_mirror":
          // Control Center ialah satu penempatan produksi. Tiada versi QA
          // baginya, jadi larian QA tidak boleh menulis kepadanya langsung.
          return {
            allowed: false,
            projectClass,
            reason:
              `Egress ${params.kind} DISEKAT: Control Center ialah ` +
              `perkhidmatan produksi dan tiada setara QA (${where}).`,
          };
        case "app_store_api":
          // Diluluskan secara eksplisit diperlukan. Sandbox Apple ialah
          // destinasi BERBEZA dengan kelayakan berbeza; membenarkannya di sini
          // secara lalai akan bermakna larian QA boleh memanggil Apple sebenar.
          return {
            allowed: false,
            projectClass,
            reason:
              `Egress ${params.kind} DISEKAT: panggilan Apple sebenar tidak ` +
              `dibenarkan secara lalai daripada QA (${where}). Pengecualian ` +
              "Sandbox memerlukan dasar destinasi dan identiti yang " +
              "diluluskan secara berasingan.",
          };
        case "fcm_push":
          // Dibenarkan HANYA kerana identiti sekeliling ialah projek QA itu
          // sendiri: Admin SDK menghantar melalui projek itu, jadi ia tidak
          // boleh mencapai peranti produksi. Ini mekanisme yang sama yang
          // menjadikan FCM selamat dalam produksi.
          return {
            allowed: true,
            projectClass,
            reason:
              `Egress ${params.kind} dibenarkan: identiti sekeliling ialah ` +
              `projek QA yang diluluskan, jadi penghantaran tidak boleh ` +
              `mencapai peranti produksi (${where}).`,
          };
      }
    }
  }
}
