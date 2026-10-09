package gsclsp

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic

/** Per-project settings: the server's `GSC` settings section and the server command. */
@Service(Service.Level.PROJECT)
@State(name = "GscLanguageServer", storages = [Storage("gsclsp.xml")])
class GscSettings(private val project: Project) : PersistentStateComponent<GscSettings.State> {
	class State {
		/** The `GSC` settings section as JSON, empty for the defaults. */
		var section: String = ""

		/** Server executable (or `.js` file run with Node.js), empty for automatic. */
		var serverPath: String = ""
	}

	private var state = State()

	override fun getState() = state

	override fun loadState(state: State) {
		this.state = state
	}

	/** The `GSC` section: defaults overlaid with the stored values. */
	var section: JsonObject
		get() {
			val result = GscPlugin.defaultSettings.deepCopy()
			val stored = state.section.takeIf { it.isNotBlank() }?.let {
				runCatching { JsonParser.parseString(it).asJsonObject }.getOrNull()
			}
			if (stored != null) merge(result, stored)
			return result
		}
		set(value) {
			state.section = value.toString()
			project.messageBus.syncPublisher(TOPIC).settingsChanged()
		}

	var serverPath: String
		get() = state.serverPath
		set(value) {
			state.serverPath = value.trim()
		}

	fun interface Listener {
		fun settingsChanged()
	}

	companion object {
		@Topic.ProjectLevel
		val TOPIC = Topic(Listener::class.java, Topic.BroadcastDirection.NONE)

		fun getInstance(project: Project): GscSettings = project.service()

		private fun merge(target: JsonObject, source: JsonObject) {
			for ((key, value) in source.entrySet()) {
				val existing = target[key]
				if (existing is JsonObject && value is JsonObject) merge(existing, value) else target.add(key, value)
			}
		}
	}
}
