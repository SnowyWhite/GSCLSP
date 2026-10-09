package gsclanguageserver

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.rows
import com.redhat.devtools.lsp4ij.LanguageServerManager

/** Settings | Languages & Frameworks | GSC: edits the server's `GSC` settings section. */
class GscConfigurable(private val project: Project) : BoundConfigurable("GSC") {
	private val settings = GscSettings.getInstance(project)

	/** Working copy, written to the settings on apply. */
	private var section = settings.section
	private var serverPath = settings.serverPath

	private fun objectAt(vararg path: String): JsonObject {
		var current = section
		for (key in path) {
			current = current[key] as? JsonObject ?: JsonObject().also { current.add(key, it) }
		}
		return current
	}

	private fun string(parent: JsonObject, key: String) = parent[key]?.takeIf { it.isJsonPrimitive }?.asString

	private fun boolean(parent: JsonObject, key: String) =
		parent[key]?.takeIf { it.isJsonPrimitive }?.asBoolean ?: false

	override fun createPanel(): DialogPanel = panel {
		val engines = GscPlugin.engines

		group("Engines") {
			for (engine in engines) {
				group("${engine.displayName}: ${engine.gameTitle}") {
					row("Root directories:") {
						textArea()
							.rows(3)
							.align(AlignX.FILL)
							.comment("Folders with stock or custom scripts, one per line. Later folders take precedence.")
							.bindText(
								{
									(objectAt("rootDirectories")[engine.id] as? JsonArray)
										?.joinToString("\n") { it.asString }.orEmpty()
								},
								{ text ->
									val paths = JsonArray()
									text.lines().map(String::trim).filter(String::isNotEmpty).forEach(paths::add)
									objectAt("rootDirectories").add(engine.id, paths)
								},
							)
					}
					row("Feature sets:") {
						for (featureset in engine.featuresets) {
							checkBox(featureset.displayName)
								// A comment would only show below the row, for one of the checkboxes:
								.applyToComponent { toolTipText = featureset.description }
								.bindSelected(
									{ boolean(objectAt("featureSets", engine.id), featureset.id) },
									{ objectAt("featureSets", engine.id).addProperty(featureset.id, it) },
								)
						}
					}
				}
			}
			row("Default engine:") {
				comboBox(engines.map { it.id })
					.bindItem({ string(section, "defaultEngine") }, { section.add("defaultEngine", JsonPrimitive(it)) })
			}.rowComment(
				"For files outside of all root directories. Without root directories, the project folder is the default engine's root directory.",
			)
		}

		group("Code Completion") {
			row {
				checkBox("Suggest keywords")
					.bindSelected(
						{ boolean(objectAt("intelliSense", "enable"), "keywords") },
						{ objectAt("intelliSense", "enable").addProperty("keywords", it) },
					)
			}
			row {
				checkBox("Suggest script functions")
					.bindSelected(
						{ boolean(objectAt("intelliSense", "enable"), "callablesScript") },
						{ objectAt("intelliSense", "enable").addProperty("callablesScript", it) },
					)
			}
			row("Engine functions:") {
				comboBox(listOf("off", "non-deprecated", "all"))
					.bindItem(
						{ string(objectAt("intelliSense", "enable"), "callablesGame") },
						{ objectAt("intelliSense", "enable").addProperty("callablesGame", it) },
					)
			}
			row("Folder sorting:") {
				comboBox(listOf("inline", "top", "bottom"))
					.bindItem(
						{ string(objectAt("intelliSense"), "foldersSorting") },
						{ objectAt("intelliSense").addProperty("foldersSorting", it) },
					)
			}
			row {
				checkBox("Concise documentation")
					.bindSelected(
						{ boolean(objectAt("intelliSense"), "conciseMode") },
						{ objectAt("intelliSense").addProperty("conciseMode", it) },
					)
			}
		}

		row("Color picker:") {
			comboBox(listOf("off", "quotients", "all"))
				.bindItem({ string(objectAt("colors"), "enable") }, { objectAt("colors").addProperty("enable", it) })
		}.rowComment("\"quotients\": only for vectors like (255/255, 128/255, 0/255).")

		group("Server") {
			row("Server path:") {
				textFieldWithBrowseButton(FileChooserDescriptorFactory.createSingleFileDescriptor(), project)
					.align(AlignX.FILL)
					.comment(
						"Optional. By default the bundled server runs with Node.js from the PATH; without Node.js, the standalone server is downloaded.",
					)
					.bindText({ serverPath }, { serverPath = it.trim() })
			}
		}
	}

	override fun reset() {
		section = settings.section
		serverPath = settings.serverPath
		super.reset()
	}

	override fun apply() {
		super.apply()
		settings.section = section.deepCopy()
		if (serverPath != settings.serverPath) {
			settings.serverPath = serverPath
			val manager = LanguageServerManager.getInstance(project)
			manager.stop(SERVER_ID)
			manager.start(SERVER_ID)
		}
	}
}
