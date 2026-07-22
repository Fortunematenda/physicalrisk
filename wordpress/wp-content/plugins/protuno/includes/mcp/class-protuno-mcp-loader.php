<?php
/**
 * MCP Server Bootstrap for Protuno
 *
 * Loads Protuno's scoped copy of the WordPress MCP Adapter (prefixed under
 * Protuno\Deps\WP\MCP\) and registers Protuno's Proton MCP server on it.
 *
 * The adapter ships in vendor-prefixed/ with all class names prefixed, so it
 * is fully isolated from any other plugin (e.g. Rank Math SEO) that may bundle
 * a different version of wordpress/mcp-adapter under the original WP\MCP\ namespace.
 *
 * @link       https://posimyth.com/
 * @since      1.0.0
 *
 * @package    Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once plugin_dir_path( __FILE__ ) . 'class-protuno-proton-mcp-server.php';
require_once plugin_dir_path( __FILE__ ) . 'class-protuno-proton-upload.php';
require_once plugin_dir_path( __FILE__ ) . 'class-protuno-agent-endpoint.php';
require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-rest.php';

/**
 * Load Protuno's scoped (prefixed) MCP Adapter and register the Proton server.
 *
 * The scoped adapter lives under Protuno\Deps\WP\MCP\... so it never
 * conflicts with the WP\MCP\... namespace used by other plugins.
 *
 * Note: Strauss does NOT rename WP action/filter string literals, so the
 * hooks 'mcp_adapter_init' and 'mcp_adapter_create_default_server' keep
 * their original names inside the scoped adapter.
 */
$protuno_mcp_autoload = PROTUNO_PATH . 'vendor-prefixed/autoload.php';

if ( is_readable( $protuno_mcp_autoload ) ) {
	require_once $protuno_mcp_autoload;

	if ( class_exists( '\Protuno\Deps\WP\MCP\Core\McpAdapter' ) ) {
		// Guarantee the adapter initializes so the action fires.
		\Protuno\Deps\WP\MCP\Core\McpAdapter::instance();

		// The Proton MCP server hooks the adapter init action to register itself.
		Protuno_Proton_MCP_Server::init();
	}
}

Protuno_Proton_Upload::init();
Protuno_Agent_Endpoint::init();
Protuno_Chat_REST::init();

/**
 * Expose Proton's MCP tools through UiChemy's endpoint as well.
 *
 * UiChemy collects these via its `uichemy_mcp_tools` filter and wraps each in
 * its OWN scoped McpTool, so we only hand over plain spec data + handler
 * callables — never adapter objects (Strauss-safe). A no-op when UiChemy isn't
 * active (the filter simply never fires). Proton's own /protuno/v1/mcp endpoint
 * keeps working independently — this is an additive bridge, not a replacement.
 */
add_filter(
	'uichemy_mcp_tools',
	function ( $tools ) {
		if ( ! is_array( $tools ) ) {
			$tools = array();
		}
		if ( class_exists( 'Protuno_Proton_MCP_Server' ) ) {
			foreach ( Protuno_Proton_MCP_Server::get_tool_definitions() as $def ) {
				$tools[] = $def;
			}
		}
		return $tools;
	}
);
