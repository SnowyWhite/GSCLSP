import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
	id("java")
	id("org.jetbrains.kotlin.jvm") version "2.4.21"
	id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "gsclsp"
version = providers.gradleProperty("pluginVersion").get()

kotlin {
	jvmToolchain(21)
}

repositories {
	mavenCentral()
	intellijPlatform {
		defaultRepositories()
	}
}

dependencies {
	intellijPlatform {
		val localPath = providers.gradleProperty("platformLocalPath").get()
		if (localPath.isNotBlank()) local(localPath)
		else create(IntelliJPlatformType.CLion, providers.gradleProperty("platformVersion"))
		plugin("com.redhat.devtools.lsp4ij", providers.gradleProperty("lsp4ijVersion").get())
		bundledPlugin("org.jetbrains.plugins.textmate")
	}
}

intellijPlatform {
	pluginConfiguration {
		version = project.version.toString()
		ideaVersion {
			sinceBuild = "252"
			untilBuild = provider { null }
		}
	}
	buildSearchableOptions = false
}

intellijPlatform {
	// Only adds @NotNull checks to Java code and needs a JDK's javac; the plugin is Kotlin.
	instrumentCode = false
}

/** Output of `npm run build -w packages/server`: server bundle, engine data and TextMate bundle. */
val serverDist = layout.projectDirectory.dir("../packages/server/dist")

tasks {
	processResources {
		val githubRepository = providers.environmentVariable("GITHUB_REPOSITORY").orNull?.takeIf { it.isNotBlank() }
			?: providers.gradleProperty("githubRepository").getOrElse("")
		val properties = mapOf("version" to project.version.toString(), "githubRepository" to githubRepository)
		inputs.properties(properties)
		filesMatching("gsclsp.properties") { expand(properties) }
	}

	// All sandboxes (buildPlugin's and runIde's) get the server, its data and the TextMate bundle.
	withType<PrepareSandboxTask> {
		val serverScript = serverDist.file("server.js").asFile
		doFirst {
			check(serverScript.exists()) {
				"Missing $serverScript. Run \"npm run build\" in the repository root first."
			}
		}
		from(serverDist) {
			include("server.js", "data/**")
			into(pluginName.map { "$it/server" })
		}
		from(serverDist.dir("textmate")) {
			into(pluginName.map { "$it/textmate" })
		}
		from(serverDist.file("lsp4ij/settings.json")) {
			into(pluginName.map { "$it/server" })
			rename { "default-settings.json" }
		}
		from(serverDist.file("lsp4ij/settings.schema.json")) {
			into(pluginName.map { "$it/server" })
		}
		// server.js is CommonJS; this keeps Node.js from treating it as an ES module when an enclosing
		// directory has a `"type": "module"` package.json.
		from(layout.projectDirectory.file("src/server/package.json")) {
			into(pluginName.map { "$it/server" })
		}
	}
}
