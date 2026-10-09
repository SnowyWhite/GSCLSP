package gsclsp

import com.google.gson.JsonObject
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.util.io.Decompressor
import com.intellij.util.io.HttpRequests
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.client.LanguageClientImpl
import com.redhat.devtools.lsp4ij.client.features.LSPClientFeatures
import com.redhat.devtools.lsp4ij.installation.LanguageServerInstallerBase
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.exists

class GscLanguageServerFactory : LanguageServerFactory {
	override fun createConnectionProvider(project: Project) = GscServerConnection(project)

	override fun createLanguageClient(project: Project): LanguageClientImpl = GscLanguageClient(project)

	override fun createClientFeatures(): LSPClientFeatures =
		LSPClientFeatures().apply { setServerInstaller(GscServerInstaller()) }
}

/**
 * Picks the server to run, in order of precedence:
 * 1. the server path from the settings
 * 2. the bundled server, run with Node.js from the PATH
 * 3. the standalone server, downloaded from the GitHub release of this plugin version
 */
object GscServerCommand {
	private val standaloneDir: Path
		get() = PathManager.getSystemDir().resolve("gsclsp").resolve(GscPlugin.version)

	val standaloneExecutable: Path
		get() = standaloneDir.resolve(
			if (System.getProperty("os.name").startsWith("Windows")) "gsclsp.exe" else "gsclsp",
		)

	private fun findNode() = PathEnvironmentVariableUtil.findExecutableInPathOnAnyOS("node")

	/** Whether the server can run without downloading the standalone server. */
	fun isAvailableWithoutDownload(project: Project) =
		GscSettings.getInstance(project).serverPath.isNotEmpty() || findNode() != null ||
			standaloneExecutable.exists()

	fun create(project: Project): GeneralCommandLine {
		val serverPath = GscSettings.getInstance(project).serverPath
		val commandLine = when {
			serverPath.endsWith(".js") -> GeneralCommandLine(findNode()?.path ?: "node", serverPath)
			serverPath.isNotEmpty() -> GeneralCommandLine(serverPath)
			else -> findNode()?.let { GeneralCommandLine(it.path, GscPlugin.serverScript.toString()) }
				?: GeneralCommandLine(standaloneExecutable.toString())
		}
		return commandLine.withParameters("--stdio").withCharset(Charsets.UTF_8)
	}

	fun downloadStandalone(indicator: ProgressIndicator) {
		val repository = GscPlugin.githubRepository
		check(repository.isNotEmpty()) {
			"Node.js was not found on the PATH and this build of the plugin has no release repository to download the standalone server from. " +
				"Install Node.js or set a server path under Settings | Languages & Frameworks | GSC."
		}
		val url = "https://github.com/$repository/releases/download/v${GscPlugin.version}/${GscPlugin.releaseAsset}"
		val archive = Files.createTempFile("gsclsp", ".zip")
		try {
			HttpRequests.request(url).saveToFile(archive, indicator)
			Decompressor.Zip(archive).extract(standaloneDir)
		} finally {
			Files.deleteIfExists(archive)
		}
		standaloneExecutable.toFile().setExecutable(true)
	}
}

class GscServerConnection(private val project: Project) : OSProcessStreamConnectionProvider() {
	override fun start() {
		// Resolved on every start, so settings changes apply after a server restart:
		commandLine = GscServerCommand.create(project)
		super.start()
	}
}

/** Downloads the standalone server if there is no server path and no Node.js. */
class GscServerInstaller : LanguageServerInstallerBase() {
	override fun checkServerInstalled(indicator: ProgressIndicator): Boolean {
		val project = project ?: return true
		return GscServerCommand.isAvailableWithoutDownload(project)
	}

	override fun install(indicator: ProgressIndicator) {
		progress("Downloading the GSC language server...", indicator)
		GscServerCommand.downloadStandalone(indicator)
	}
}

class GscLanguageClient(project: Project) : LanguageClientImpl(project) {
	init {
		project.messageBus.connect(this).subscribe(
			GscSettings.TOPIC,
			GscSettings.Listener { triggerChangeConfiguration() },
		)
	}

	/** Answers `workspace/configuration` and is sent with `workspace/didChangeConfiguration`. */
	override fun createSettings(): Any = JsonObject().apply {
		add(SETTINGS_SECTION, GscSettings.getInstance(project).section)
	}
}
