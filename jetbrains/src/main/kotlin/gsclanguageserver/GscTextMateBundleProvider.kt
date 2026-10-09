package gsclanguageserver

import org.jetbrains.plugins.textmate.api.TextMateBundleProvider

/** Syntax highlighting for `*.gsc`/`*.csc` without registering a TextMate bundle by hand. */
class GscTextMateBundleProvider : TextMateBundleProvider {
	override fun getBundles() = listOf(TextMateBundleProvider.PluginBundle("GSC", GscPlugin.textMateBundle))
}
