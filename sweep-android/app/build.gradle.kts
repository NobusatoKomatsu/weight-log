plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val buildNumber = (System.getenv("VERSION_CODE") ?: "1").toInt()

// AdMob の ID。いまは Google が公開しているテスト用 ID（本物の広告は出ない）。
// 本番の ID が決まったら、ここを書き換える
val admobAppId = "ca-app-pub-3940256099942544~3347511713"
val admobBannerId = "ca-app-pub-3940256099942544/9214589741"

android {
    namespace = "io.github.nobusatokomatsu.appsweep"
    compileSdk = 36

    defaultConfig {
        // ストアでの ID。公式サイト applications.sucks に合わせている（一度公開すると変えられない）
        applicationId = "sucks.applications.sweep"
        minSdk = 28
        targetSdk = 36
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        manifestPlaceholders["admobAppId"] = admobAppId
        buildConfigField("String", "ADMOB_BANNER_ID", "\"$admobBannerId\"")
    }

    signingConfigs {
        create("release") {
            System.getenv("KEYSTORE_PATH")?.let { path ->
                storeFile = file(path)
                storeType = "pkcs12"
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = "weightlog"
                keyPassword = System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            it.testLogging {
                events("failed")
                exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
            }
        }
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    testImplementation("junit:junit:4.13.2")
}
