<?php
/**
 * Plugin Name: auto-webmcp
 * Plugin URI:  https://autowebmcp.dev
 * Description: Make every form on your WordPress site callable by AI agents via Chrome WebMCP. Drop-in, zero configuration, works with WooCommerce, Contact Form 7, WPForms, and all standard HTML forms.
 * Version:     0.2.1
 * Author:      Prasanna Vaidya
 * Author URI:  https://gyde.ai
 * License:     MIT
 * License URI: https://opensource.org/licenses/MIT
 * Text Domain: auto-webmcp
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'AUTO_WEBMCP_VERSION', '0.2.1' );
define( 'AUTO_WEBMCP_CDN', 'https://cdn.jsdelivr.net/npm/auto-webmcp@' . AUTO_WEBMCP_VERSION . '/dist/auto-webmcp.iife.js' );

/**
 * Inject the auto-webmcp script in the footer of every page.
 */
function auto_webmcp_enqueue_script() {
    $options = get_option( 'auto_webmcp_options', array() );
    $enabled = isset( $options['enabled'] ) ? (bool) $options['enabled'] : true;

    if ( ! $enabled ) {
        return;
    }

    wp_enqueue_script(
        'auto-webmcp',
        AUTO_WEBMCP_CDN,
        array(),
        AUTO_WEBMCP_VERSION,
        array( 'in_footer' => true, 'strategy' => 'async' )
    );
}
add_action( 'wp_enqueue_scripts', 'auto_webmcp_enqueue_script' );

/**
 * Register the settings page under Settings > AI-Agent Forms.
 */
function auto_webmcp_admin_menu() {
    add_options_page(
        'AI-Agent Ready Forms',
        'AI-Agent Forms',
        'manage_options',
        'auto-webmcp',
        'auto_webmcp_settings_page'
    );
}
add_action( 'admin_menu', 'auto_webmcp_admin_menu' );

/**
 * Register plugin settings.
 */
function auto_webmcp_register_settings() {
    register_setting( 'auto_webmcp_group', 'auto_webmcp_options', array(
        'sanitize_callback' => 'auto_webmcp_sanitize_options',
        'default'           => array( 'enabled' => true ),
    ) );
}
add_action( 'admin_init', 'auto_webmcp_register_settings' );

function auto_webmcp_sanitize_options( $input ) {
    return array(
        'enabled' => ! empty( $input['enabled'] ),
    );
}

/**
 * Render the settings page.
 */
function auto_webmcp_settings_page() {
    $options = get_option( 'auto_webmcp_options', array( 'enabled' => true ) );
    ?>
    <div class="wrap">
        <h1>AI-Agent Ready Forms</h1>
        <p>
            Powered by <a href="https://autowebmcp.dev" target="_blank" rel="noopener">auto-webmcp</a>.
            Makes every HTML form on your site callable by AI agents via
            <a href="https://developer.chrome.com/docs/extensions/webmcp" target="_blank" rel="noopener">Chrome WebMCP</a>.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields( 'auto_webmcp_group' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row">Enable auto-webmcp</th>
                    <td>
                        <label>
                            <input type="checkbox" name="auto_webmcp_options[enabled]" value="1" <?php checked( ! empty( $options['enabled'] ) ); ?> />
                            Load the auto-webmcp script on all public pages
                        </label>
                        <p class="description">
                            When enabled, a single script tag is added to the footer of every page.
                            The script is invisible to regular visitors and only activates when a
                            WebMCP-capable AI agent is present.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
        <hr>
        <h2>How it works</h2>
        <ol>
            <li>Enable the plugin above and save.</li>
            <li>Open any page on your site in Chrome 146+ with the <strong>WebMCP testing flag</strong> enabled at <code>chrome://flags/#enable-webmcp-testing</code>.</li>
            <li>Install the <strong>Model Context Tool Inspector</strong> Chrome extension.</li>
            <li>Your forms will appear as registered AI tools in the inspector panel.</li>
        </ol>
        <p>
            <a href="https://autowebmcp.dev" target="_blank" rel="noopener">Full documentation →</a> &nbsp;|&nbsp;
            <a href="https://autowebmcp.dev/platforms/wordpress" target="_blank" rel="noopener">WordPress install guide →</a>
        </p>
    </div>
    <?php
}
