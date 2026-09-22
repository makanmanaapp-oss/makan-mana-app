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
 * Sebelum ini "produksi" bermaksud *apa-apa yang bukan `demo-`*. Kini setiap
 * identiti diklasifikasikan secara eksplisit, dan apa-apa yang tidak dikenali
 * GAGAL-TERTUTUP. Satu projek tidak menjadi QA kerana namanya mengandungi
 * "qa" atau "test", atau kerana ia berbeza daripada produksi.
 *
 * WAVE 3D — IDENTITI SASARAN, BUKAN HANYA IDENTITI RUNTIME
 * --------------------------------------------------------
 * Mengetahui runtime ialah QA TIDAK membuktikan operasi itu sampai ke projek
 * QA. Klien SDK memilih projek sasaran mereka sendiri, dan tidak selalu
 * daripada sumber yang sama dengan pagar ini:
 *
 *   firebase-admin 13.10.0 utils.getExplicitProjectId():
 *     options.projectId (dari FIREBASE_CONFIG — JSON ATAU laluan fail)
 *     -> projek kelayakan akaun perkhidmatan
 *     -> GOOGLE_CLOUD_PROJECT || GCLOUD_PROJECT
 *     -> ADC (pelayan metadata)
 *   google-auth-library getProjectId():
 *     GCLOUD_PROJECT || GOOGLE_CLOUD_PROJECT || gcloud_project -> fail kunci
 *     -> konfigurasi gcloud -> pelayan metadata
 *   Storage: nama baldi EKSPLISIT, yang boleh menamakan projek lain.
 *
 * Jadi runtime yang pagar ini lihat sebagai QA boleh, dengan konfigurasi yang
 * salah, menghantar FCM ke projek produksi atau menulis ke baldi produksi.
 * Operasi yang sasarannya boleh ditentukan kini membawa `targetProjectId`, dan
 * dalam REAL_QA sasaran itu MESTI disahkan dan MESTI sepadan runtime.
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

/**
 * Operasi luaran yang dilindungi.
 *
 * Kebenaran diberikan MENGIKUT OPERASI, bukan melalui satu suis. Setiap jenis
 * menamakan kelas destinasi dengan risiko yang berbeza:
 *
 *   control_center_mirror  cermin peristiwa ke Control Center produksi
 *   control_center_api     setiap titik akhir Control Center PRODUKSI yang lain:
 *                          AI brain, data vault, operasi tempat, jambatan
 *                          merchant, dan pangkalan data satah kawalannya
 *   fcm_push               penghantaran FCM
 *   app_store_api          App Store Server API
 *   google_play_api        Google Play Developer API (pengesahan langganan)
 *   google_cloud_api       API Google berskop projek: Places, Vertex AI
 *   firebase_storage       baldi Cloud Storage yang DINAMAKAN secara eksplisit
 */
export type EgressKind =
  | "control_center_mirror"
  | "control_center_api"
  | "fcm_push"
  | "app_store_api"
  | "google_play_api"
  | "google_cloud_api"
  | "firebase_storage";

/** Control Center ialah satu penempatan produksi; tiada setara QA. */
function isControlCenterKind(kind: EgressKind): boolean {
  return kind === "control_center_mirror" || kind === "control_center_api";
}

/**
 * Jenis yang mempunyai setara GELUNG-BALIK dalam QA emulator tempatan: konsol
 * Control Center tempatan, dan emulator Storage. Setiap perkhidmatan lain tiada
 * emulator, jadi panggilan dari QA akan keluar sebenar.
 */
function hasLoopbackEquivalent(kind: EgressKind): boolean {
  return isControlCenterKind(kind) || kind === "firebase_storage";
}

/**
 * Jenis yang, dalam REAL_QA, dibenarkan HANYA apabila projek sasaran telah
 * DISAHKAN dan sepadan runtime. Identiti runtime sahaja tidak mencukupi.
 */
function requiresVerifiedTargetInRealQa(kind: EgressKind): boolean {
  return (
    kind === "fcm_push" ||
    kind === "google_cloud_api" ||
    kind === "firebase_storage"
  );
}

export interface EgressEnvironment {
  /** Identiti projek, atau null jika ia tidak dapat ditentukan langsung. */
  projectId: string | null;
  /** Benar apabila proses berjalan di dalam emulator Functions. */
  inEmulator: boolean;
  /**
   * Diisi apabila sumber identiti TIDAK BERSETUJU atau tidak dapat disahkan.
   * Persekitaran sedemikian tidak boleh dipercayai, jadi ia disekat dan bukan
   * diselesaikan mengikut keutamaan.
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

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
 * Setiap pemboleh ubah yang firebase-admin ATAU google-auth-library gunakan
 * untuk memilih projek dibaca di sini. Jika pagar mengabaikan satu yang SDK
 * patuhi, runtime boleh kelihatan QA kepada pagar sementara SDK menyasar
 * produksi.
 *
 * Apabila LEBIH DARIPADA SATU sumber hadir dan ia TIDAK BERSETUJU, persekitaran
 * itu tidak koheren dan disekat. `FIREBASE_CONFIG` yang merupakan LALUAN FAIL
 * (firebase-admin membacanya dari cakera) tidak dapat disahkan oleh fungsi
 * tulen tanpa I/O, jadi ia juga disekat.
 */
export function readEgressEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EgressEnvironment {
  const sources: Array<{name: string; value: string}> = [];

  const add = (name: string, raw: string | undefined): void => {
    const value = nonEmpty(raw);
    if (value !== null) sources.push({name, value});
  };

  add("GCLOUD_PROJECT", env.GCLOUD_PROJECT);
  add("GCP_PROJECT", env.GCP_PROJECT);
  // Dibaca oleh firebase-admin (DAHULU daripada GCLOUD_PROJECT) dan oleh
  // google-auth-library. Sebelum Wave 3D pagar ini tidak membacanya.
  add("GOOGLE_CLOUD_PROJECT", env.GOOGLE_CLOUD_PROJECT);
  add("gcloud_project", env.gcloud_project);

  const inEmulator = env.FUNCTIONS_EMULATOR === "true";

  const firebaseConfig = nonEmpty(env.FIREBASE_CONFIG);
  if (firebaseConfig !== null) {
    if (firebaseConfig.startsWith("{")) {
      try {
        const parsed = JSON.parse(firebaseConfig) as {projectId?: unknown};
        if (typeof parsed.projectId === "string") {
          add("FIREBASE_CONFIG.projectId", parsed.projectId);
        }
      } catch {
        // JSON cacat: menyumbang TIADA identiti. firebase-admin sendiri gagal
        // memulakan dengan konfigurasi sedemikian.
      }
    } else {
      return {
        projectId: null,
        inEmulator,
        conflict:
          "FIREBASE_CONFIG ialah laluan fail; firebase-admin membaca identiti " +
          "daripadanya tetapi pagar tulen tidak dapat mengesahkannya",
      };
    }
  }

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
 * Projek yang SEBENARNYA disasar oleh klien Firebase Admin lalai (FCM,
 * Firestore) — mengikut keutamaan firebase-admin 13.10.0
 * `utils.getExplicitProjectId`, disahkan dalam sumber yang dipasang.
 *
 * Pulangkan null apabila SDK akan jatuh balik kepada pelayan metadata ADC,
 * yang tidak dapat disahkan tanpa I/O. Null bermakna "tidak disahkan", dan
 * dalam REAL_QA itu disekat.
 */
export function resolveFirebaseAdminTargetProject(params: {
  /** `app.options.projectId` — dimuatkan daripada FIREBASE_CONFIG. */
  optionsProjectId?: string | null;
  /** Hanya apabila kelayakan ialah ServiceAccountCredential. */
  serviceAccountProjectId?: string | null;
  env: NodeJS.ProcessEnv;
}): string | null {
  return (
    nonEmpty(params.optionsProjectId) ??
    nonEmpty(params.serviceAccountProjectId) ??
    nonEmpty(params.env.GOOGLE_CLOUD_PROJECT) ??
    nonEmpty(params.env.GCLOUD_PROJECT) ??
    null
  );
}

/**
 * Projek pemilik baldi Firebase LALAI, diterbitkan daripada namanya.
 *
 * Baldi lalai Firebase dinamakan `<projectId>.firebasestorage.app` atau
 * `<projectId>.appspot.com`. Baldi tersuai tidak mendedahkan pemiliknya dalam
 * nama — null, iaitu "tidak disahkan".
 */
export function projectOfStorageBucket(bucket: string | null | undefined): string | null {
  const name = nonEmpty(bucket);
  if (name === null) return null;
  for (const suffix of [".firebasestorage.app", ".appspot.com"]) {
    if (name.endsWith(suffix)) return nonEmpty(name.slice(0, -suffix.length));
  }
  return null;
}

/**
 * Destinasi SEBENAR operasi Storage firebase-admin apabila emulator aktif.
 *
 * firebase-admin menukar FIREBASE_STORAGE_EMULATOR_HOST kepada
 * STORAGE_EMULATOR_HOST (dengan `http://`), dan klien Storage menghala ke situ.
 * Tanpa kedua-duanya, operasi pergi ke Cloud Storage SEBENAR.
 */
export function storageEmulatorDestination(env: NodeJS.ProcessEnv): string {
  const direct = nonEmpty(env.STORAGE_EMULATOR_HOST);
  if (direct !== null) return direct;
  const firebase = nonEmpty(env.FIREBASE_STORAGE_EMULATOR_HOST);
  return firebase !== null ? `http://${firebase}` : "";
}

/**
 * WAVE 3E — siapa yang menandatangani URL Storage.
 *
 * `@google-cloud/storage` 7.21.0 SENTIASA memanggil `auth.sign()` (signer.js
 * :149, :229), termasuk dalam mod emulator. google-auth-library `sign()`
 * memanggil IAM `signBlob` SEBENAR untuk ADC impersonated, akaun luaran dan
 * GCE — jadi emulator boleh memanggil IAM sebenar dengan kelayakan pemilik.
 *
 * Dalam QA emulator tempatan yang dihala ke emulator Storage, URL
 * ditandatangani dengan kunci pakai-buang yang dijana dalam proses: tiada
 * panggilan IAM, tiada kelayakan pemilik. Setiap kelas lain menggunakan
 * penandatangan SDK biasa — produksi tidak berubah.
 */
export type StorageSigningMode = "sdk_credentials" | "emulator_disposable_key";

export function storageSigningMode(decision: EgressDecision): StorageSigningMode {
  return decision.allowed && decision.projectClass === "LOCAL_EMULATOR_QA"
    ? "emulator_disposable_key"
    : "sdk_credentials";
}

/**
 * Keputusan akses Storage penuh untuk satu nama baldi — tulen, boleh diuji.
 *
 * Nama kosong disekat (GROUP_IMAGE_BUCKET="" menjadikan STORAGE_BUCKET kosong,
 * kerana `??` hanya menggantikan undefined). Selebihnya ialah keputusan egress
 * `firebase_storage` dengan projek yang diterbitkan daripada nama baldi, dan
 * mod penandatangan yang terhasil.
 */
export function decideStorageAccess(params: {
  bucket: string | null | undefined;
  env: NodeJS.ProcessEnv;
  approvedRealQaProjectId?: string | null;
}): EgressDecision & {bucket: string | null; signingMode: StorageSigningMode} {
  const bucket = nonEmpty(params.bucket);
  const runtime = readEgressEnvironment(params.env);
  if (bucket === null) {
    return {
      allowed: false,
      projectClass: classifyProject(
        runtime.projectId,
        params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID,
      ),
      reason: "Egress firebase_storage DISEKAT: nama baldi kosong.",
      bucket: null,
      signingMode: "sdk_credentials",
    };
  }
  const decision = decideEgress({
    kind: "firebase_storage",
    destination: storageEmulatorDestination(params.env),
    targetProjectId: projectOfStorageBucket(bucket),
    env: runtime,
    approvedRealQaProjectId: params.approvedRealQaProjectId,
  });
  return {...decision, bucket, signingMode: storageSigningMode(decision)};
}

/**
 * Hos emulator `host:port` (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST)
 * sebagai URL, supaya semakan gelung-balik yang sama boleh digunakan.
 *
 * firebase-tools 15.22.4 menulis hos ini melalui `formatHost` ->
 * `connectableHostname`, yang menukar 0.0.0.0 kepada 127.0.0.1 dan :: kepada
 * ::1 — jadi emulator yang terikat pada semua antara muka masih gelung-balik.
 */
export function emulatorHostDestination(host: string | null | undefined): string {
  const value = nonEmpty(host);
  if (value === null) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

/** Perkhidmatan Firebase Admin yang BUKAN operasi keluar tetapi tetap sasaran. */
export type AdminService = "firestore" | "auth";

export interface AdminIsolationDecision {
  allowed: boolean;
  reason: string;
  /** Projek yang klien Admin akan sasarkan, jika boleh ditentukan. */
  target: string | null;
  targetClass: ProjectClass;
}

/**
 * WAVE 3E — pengasingan Firestore dan Auth Admin.
 *
 * Firestore dan Auth bukan egress, jadi pagar egress tidak melindunginya.
 * Tetapi mereka menyasar projek melalui peraturan yang SAMA seperti FCM,
 * disahkan dalam firebase-admin 13.10.0 yang dipasang:
 *
 *   firestore/firestore-internal.js:85  projectId = getExplicitProjectId(app);
 *     jika null, klien Firestore MENEMUI projek sendiri melalui ADC
 *     (fail kunci / konfigurasi gcloud / pelayan metadata)
 *   auth/auth-api-request.js:129        findProjectId(app)
 *   @google-cloud/firestore             FIRESTORE_EMULATOR_HOST
 *   auth/auth-api-request.js:1940       FIREBASE_AUTH_EMULATOR_HOST
 *
 * Kes berbahaya yang disahkan: FIREBASE_CONFIG tiada,
 * GOOGLE_CLOUD_PROJECT=produksi, GCLOUD_PROJECT=QA. Egress disekat
 * (percanggahan), tetapi firebase-admin membaca GOOGLE_CLOUD_PROJECT DAHULU,
 * jadi Firestore menulis ke PRODUKSI.
 *
 * Peraturan:
 *   1. Dihala ke emulator gelung-balik -> dibenarkan; data tidak meninggalkan
 *      mesin. Hos emulator bukan-gelung-balik -> disekat.
 *   2. Emulator Functions TANPA emulator perkhidmatan ini -> disekat; ia akan
 *      mencapai perkhidmatan SEBENAR dengan ADC pemilik.
 *   3. Sumber identiti bercanggah, sasaran tidak dapat disahkan (jatuh balik
 *      ADC), identiti runtime tiada, atau sasaran != runtime -> disekat.
 *   4. Sasaran mesti produksi atau QA sebenar yang diluluskan. Projek `demo-`
 *      tanpa emulator, atau projek tidak dikenali -> disekat.
 */
export function decideFirebaseAdminIsolation(params: {
  service: AdminService;
  env: NodeJS.ProcessEnv;
  optionsProjectId?: string | null;
  serviceAccountProjectId?: string | null;
  approvedRealQaProjectId?: string | null;
}): AdminIsolationDecision {
  const {service, env} = params;
  const target = resolveFirebaseAdminTargetProject({
    optionsProjectId: params.optionsProjectId,
    serviceAccountProjectId: params.serviceAccountProjectId,
    env,
  });
  const approvedRealQa = params.approvedRealQaProjectId ?? APPROVED_REAL_QA_PROJECT_ID;
  const targetClass = classifyProject(target, approvedRealQa);
  const runtime = readEgressEnvironment(env);
  const emulatorVar =
    service === "firestore" ? "FIRESTORE_EMULATOR_HOST" : "FIREBASE_AUTH_EMULATOR_HOST";
  const emulator = emulatorHostDestination(env[emulatorVar]);
  const where =
    `${service}: sasaran=${target ?? "<tidak disahkan>"} ` +
    `runtime=${runtime.projectId ?? "<tidak diketahui>"} emulator=${runtime.inEmulator}`;
  const deny = (why: string): AdminIsolationDecision => ({
    allowed: false,
    target,
    targetClass,
    reason: `Firebase Admin ${service} DISEKAT: ${why} (${where}).`,
  });

  // 1. Penghalaan emulator.
  if (emulator !== "") {
    if (isLoopbackDestination(emulator)) {
      return {
        allowed: true,
        target,
        targetClass,
        reason: `Firebase Admin ${service} dihala ke emulator gelung-balik (${where}).`,
      };
    }
    return deny(`${emulatorVar} menunjuk ke hos bukan-gelung-balik`);
  }

  // 2. Proses emulator tanpa emulator perkhidmatan ini.
  if (runtime.inEmulator) {
    return deny(
      `emulator Functions berjalan tanpa ${emulatorVar}; ${service} akan ` +
      "dicapai SEBENAR dengan kelayakan pemilik",
    );
  }

  // 3. Identiti.
  if (runtime.conflict) return deny(runtime.conflict);
  if (target === null) {
    return deny(
      "projek sasaran tidak dapat disahkan; SDK akan menemuinya melalui ADC " +
      "(fail kunci, konfigurasi gcloud atau pelayan metadata)",
    );
  }
  if (runtime.projectId === null) return deny("identiti runtime tiada");
  if (runtime.projectId !== target) return deny("sasaran bukan identiti runtime");

  // 4. Sasaran yang diluluskan.
  if (targetClass === "PRODUCTION" || targetClass === "REAL_QA") {
    return {
      allowed: true,
      target,
      targetClass,
      reason: `Firebase Admin ${service} dibenarkan (${where}).`,
    };
  }
  if (targetClass === "LOCAL_EMULATOR_QA") {
    return deny(`projek \`${QA_PROJECT_PREFIX}\` tanpa emulator ${service}`);
  }
  return deny("projek sasaran tidak dikenali");
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
  /** URL destinasi, untuk semakan gelung-balik QA emulator. */
  destination?: string;
  /**
   * Projek yang operasi ini SEBENARNYA sasarkan, jika boleh ditentukan.
   * Apabila diberi, ia mesti sepadan identiti runtime — dalam produksi dan
   * REAL_QA. Dalam REAL_QA, ketiadaannya bermakna sasaran tidak disahkan dan
   * disekat.
   */
  targetProjectId?: string | null;
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
  const target = nonEmpty(params.targetProjectId);
  const where =
    `project=${projectId ?? "<tidak diketahui>"} emulator=${inEmulator}` +
    (target !== null ? ` sasaran=${target}` : "");

  // 0. Persekitaran bercanggah atau tidak dapat disahkan.
  if (env.conflict) {
    return {
      allowed: false,
      projectClass: "UNKNOWN",
      reason:
        `Egress ${params.kind} DISEKAT: ${env.conflict}. Persekitaran yang ` +
        "bercanggah tidak diselesaikan mengikut keutamaan — ia disekat.",
    };
  }

  const targetMismatch = (): EgressDecision => ({
    allowed: false,
    projectClass,
    reason:
      `Egress ${params.kind} DISEKAT: operasi menyasar projek ${target}, ` +
      `bukan identiti runtime (${where}). Kelayakan atau konfigurasi SDK ` +
      "menunjuk ke projek lain.",
  });

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
      // Runtime produksi yang menyasar projek LAIN (cth. QA) ialah salah
      // konfigurasi, bukan produksi yang sah.
      if (target !== null && target !== projectId) return targetMismatch();
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
      // Hanya Control Center (konsol tempatan) dan Storage (emulator) ada
      // setara gelung-balik. Setiap perkhidmatan lain — FCM, App Store, Google
      // Play, Places, Vertex — tiada emulator dan akan keluar SEBENAR.
      if (!hasLoopbackEquivalent(params.kind)) {
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: perkhidmatan ini tiada emulator, ` +
            `jadi panggilan dari larian QA akan keluar sebenar (${where}).`,
        };
      }
      // Projek sasaran yang DINAMAKAN tidak relevan di sini: apabila destinasi
      // ialah gelung-balik, panggilan tidak pernah meninggalkan mesin.
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
          `destinasi bukan-gelung-balik (${where}). Untuk Storage ini ` +
          "bermakna emulator Storage tidak aktif.",
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
      if (isControlCenterKind(params.kind)) {
        // Control Center ialah satu penempatan produksi. Tiada versi QA
        // baginya, jadi larian QA tidak boleh menulis kepadanya langsung —
        // walaupun rahsianya tersedia.
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: Control Center ialah ` +
            `perkhidmatan produksi dan tiada setara QA (${where}).`,
        };
      }
      if (params.kind === "app_store_api" || params.kind === "google_play_api") {
        // API KEDAI membaca data pembelian SEBENAR. Pengecualian Sandbox
        // memerlukan dasar yang diluluskan secara berasingan — belum ada.
        return {
          allowed: false,
          projectClass,
          reason:
            `Egress ${params.kind} DISEKAT: API kedai sebenar tidak ` +
            `dibenarkan secara lalai daripada QA (${where}). Pengecualian ` +
            "Sandbox atau ujian memerlukan dasar destinasi dan identiti " +
            "yang diluluskan secara berasingan.",
        };
      }
      if (requiresVerifiedTargetInRealQa(params.kind)) {
        if (target === null) {
          // Identiti runtime QA TIDAK membuktikan sasaran QA. Kunci API
          // (Places) tidak mendedahkan projek pemiliknya; ADC boleh
          // diselesaikan kepada projek lain. Tidak disahkan = disekat.
          return {
            allowed: false,
            projectClass,
            reason:
              `Egress ${params.kind} DISEKAT: projek sasaran tidak dapat ` +
              `disahkan (${where}). Dalam QA sebenar, identiti runtime ` +
              "sahaja tidak membuktikan operasi sampai ke projek QA.",
          };
        }
        if (target !== projectId) return targetMismatch();
        return {
          allowed: true,
          projectClass,
          reason:
            `Egress ${params.kind} dibenarkan: sasaran disahkan sebagai ` +
            `projek QA yang diluluskan (${where}).`,
        };
      }
      // Tidak sepatutnya dicapai: setiap jenis ditangani di atas.
      return {
        allowed: false,
        projectClass,
        reason: `Egress ${params.kind} DISEKAT: jenis tidak dikendalikan (${where}).`,
      };
    }
  }
}
