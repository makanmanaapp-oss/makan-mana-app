import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Kunci penandatanganan release (android/key.properties - JANGAN commit).
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

// GAGAL-TERTUTUP PENANDATANGANAN.
//
// Dahulu binaan `release` jatuh kepada kunci DEBUG secara SENYAP apabila
// key.properties tiada. Binaan "berjaya", menghasilkan AAB yang ditandatangani
// dengan kunci yang salah, dan hanya Play yang menolaknya kemudian - selepas
// masa dihabiskan untuk memuat naik. Worktree baharu tidak mewarisi
// key.properties (sengaja tidak dijejaki Git), jadi ini adalah lalai, bukan
// kes tepi.
//
// Kami menyemak KELENGKAPAN, bukan sekadar kewujudan fail: kunci yang hilang
// atau storeFile yang tidak wujud sama bahaya dengan tiada fail langsung.
// TIADA nilai rahsia dibaca ke dalam log - hanya NAMA medan yang hilang.
val requiredSigningKeys = listOf("keyAlias", "keyPassword", "storeFile", "storePassword")
val missingSigningKeys: List<String> = when {
    !keystorePropertiesFile.exists() -> listOf("<android/key.properties tiada>")
    else -> requiredSigningKeys.filter {
        (keystoreProperties[it] as String?).isNullOrBlank()
    }
}
val signingStoreFile = (keystoreProperties["storeFile"] as String?)
    ?.takeIf { it.isNotBlank() }?.let { rootProject.file(it) }
val signingStoreMissing = missingSigningKeys.isEmpty() &&
    (signingStoreFile == null || !signingStoreFile.exists())
val hasReleaseSigning = missingSigningKeys.isEmpty() && !signingStoreMissing

/// Sebab yang boleh dibaca manusia - TIDAK PERNAH mengandungi rahsia.
val signingFailureReason: String = when {
    !keystorePropertiesFile.exists() ->
        "android/key.properties tidak dijumpai"
    missingSigningKeys.isNotEmpty() ->
        "android/key.properties kehilangan/kosong: " + missingSigningKeys.joinToString(", ")
    signingStoreMissing ->
        "storeFile yang dirujuk oleh key.properties tidak wujud pada cakera"
    else -> ""
}

android {
    namespace = "com.makanmana.makan_mana"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.makanmana.apps"
        // Firebase Auth memerlukan minSdk 23.
        minSdk = maxOf(23, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = signingStoreFile
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // TIADA jatuh balik kepada kunci debug. Apabila penandatanganan
            // keluaran tiada, varian release kekal TIDAK ditandatangani dan
            // gate di bawah menghentikan binaan produksi dengan jelas.
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                null
            }
        }
    }

    // QA-DEV1: dimensi flavor "env" untuk QA hidup bersebelahan pengeluaran.
    //   prod → com.makanmana.apps     (label "MakanMana")     — TIDAK berubah.
    //   qa   → com.makanmana.apps.qa  (label "MakanMana QA")  — pakej berasingan.
    // Pengeluaran mesti dibina dengan --flavor prod selepas ini.
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            manifestPlaceholders["appLabel"] = "MakanMana"
        }
        create("qa") {
            dimension = "env"
            applicationIdSuffix = ".qa"
            manifestPlaceholders["appLabel"] = "MakanMana QA"
        }
    }
}

// GATE KELUARAN - berkuat kuasa apabila graf tugas SIAP, sebelum sebarang
// tugas berjalan.
//
// Percubaan pertama menggantungkannya pada doFirst `bundleProdRelease`. Ia
// memang menghentikan binaan - tetapi TERLALU LEWAT: `bundle*` ialah tugas
// kitaran hayat, jadi `packageProdReleaseBundle` sudah menulis .aab ke cakera
// sebelum gate menembak. Dibuktikan atas mesin ini: binaan GAGAL, namun AAB
// (tidak ditandatangani) tertinggal dalam build/app/outputs.
//
// `taskGraph.whenReady` menembak selepas graf diselesaikan dan SEBELUM tugas
// pertama dijalankan, jadi tiada kompilasi dan tiada artifak.
//
// prod + release  -> GAGAL jelas tanpa penandatanganan keluaran yang sah.
// qa   + release  -> dibenarkan (artifak QA tidak pernah dimuat naik) tetapi
//                    diberi amaran LANTANG.
// sebarang debug  -> tidak disentuh; QA/debug kekal boleh digunakan tanpa
//                    kelayakan produksi.
gradle.taskGraph.whenReady {
    if (hasReleaseSigning) return@whenReady
    val releaseTasks = allTasks
        .map { it.name }
        .filter { n ->
            (n.startsWith("assemble") || n.startsWith("bundle") ||
                n.startsWith("package") || n.startsWith("sign")) &&
                n.contains("Release")
        }
    val prodTasks = releaseTasks.filter { it.contains("Prod", ignoreCase = true) }
    if (prodTasks.isNotEmpty()) {
        throw GradleException(
            "\n" +
            "PENANDATANGANAN KELUARAN TIADA - binaan produksi dihentikan.\n" +
            "\n" +
            "  sebab : " + signingFailureReason + "\n" +
            "  tugas : " + prodTasks.first() + "\n" +
            "\n" +
            "Binaan ini DAHULU akan diteruskan dan menandatangani dengan kunci\n" +
            "DEBUG secara senyap. AAB yang terhasil kelihatan sah dan akan\n" +
            "ditolak oleh Play atas sidik jari penandatangan yang salah.\n" +
            "\n" +
            "Sediakan android/key.properties (keyAlias, keyPassword, storeFile,\n" +
            "storePassword) yang menunjuk kepada upload keystore, kemudian bina\n" +
            "semula. JANGAN commit fail itu atau keystore.\n"
        )
    }
    if (releaseTasks.isNotEmpty()) {
        logger.warn(
            "AMARAN: binaan release TANPA penandatanganan keluaran (" +
            signingFailureReason + "). Artifak QA sahaja - JANGAN muat naik."
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
