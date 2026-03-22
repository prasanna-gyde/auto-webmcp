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
 * Load plugin text domain for translations.
 *
 * @since 0.2.1
 */
function auto_webmcp_load_textdomain() {
	load_plugin_textdomain( 'auto-webmcp', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}
add_action( 'plugins_loaded', 'auto_webmcp_load_textdomain' );

/**
 * Inject the auto-webmcp script in the footer of every page.
 *
 * @since 0.2.1
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
 *
 * @since 0.2.1
 */
function auto_webmcp_admin_menu() {
	add_options_page(
		esc_html__( 'AI-Agent Ready Forms', 'auto-webmcp' ),
		esc_html__( 'AI-Agent Forms', 'auto-webmcp' ),
		'manage_options',
		'auto-webmcp',
		'auto_webmcp_settings_page'
	);
}
add_action( 'admin_menu', 'auto_webmcp_admin_menu' );

/**
 * Register plugin settings.
 *
 * @since 0.2.1
 */
function auto_webmcp_register_settings() {
	register_setting(
		'auto_webmcp_group',
		'auto_webmcp_options',
		array(
			'sanitize_callback' => 'auto_webmcp_sanitize_options',
			'default'           => array( 'enabled' => true ),
		)
	);
}
add_action( 'admin_init', 'auto_webmcp_register_settings' );

/**
 * Sanitize plugin options.
 *
 * @since  0.2.1
 * @param  array $input Raw input array.
 * @return array Sanitized options.
 */
function auto_webmcp_sanitize_options( $input ) {
	return array(
		'enabled' => ! empty( $input['enabled'] ),
	);
}

/**
 * Render the settings page.
 *
 * @since 0.2.1
 */
function auto_webmcp_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$options = get_option( 'auto_webmcp_options', array( 'enabled' => true ) );
	?>
	<div class="wrap">
		<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
		<p>
			<?php
			printf(
				/* translators: 1: link to autowebmcp.dev, 2: link to Chrome WebMCP docs */
				esc_html__( 'Powered by %1$s. Makes every HTML form on your site callable by AI agents via %2$s.', 'auto-webmcp' ),
				'<a href="https://autowebmcp.dev" target="_blank" rel="noopener">auto-webmcp</a>',
				'<a href="https://developer.chrome.com/docs/extensions/webmcp" target="_blank" rel="noopener">Chrome WebMCP</a>'
			);
			?>
		</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'auto_webmcp_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Enable auto-webmcp', 'auto-webmcp' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="auto_webmcp_options[enabled]" value="1" <?php checked( ! empty( $options['enabled'] ) ); ?> />
							<?php esc_html_e( 'Load the auto-webmcp script on all public pages', 'auto-webmcp' ); ?>
						</label>
						<p class="description">
							<?php esc_html_e( 'When enabled, a single script tag is added to the footer of every page. The script is invisible to regular visitors and only activates when a WebMCP-capable AI agent is present.', 'auto-webmcp' ); ?>
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<hr>
		<h2><?php esc_html_e( 'How it works', 'auto-webmcp' ); ?></h2>
		<ol>
			<li><?php esc_html_e( 'Enable the plugin above and save.', 'auto-webmcp' ); ?></li>
			<li>
				<?php
				printf(
					/* translators: %s: Chrome flags URL */
					esc_html__( 'Open any page on your site in Chrome 146+ with the WebMCP testing flag enabled at %s.', 'auto-webmcp' ),
					'<code>chrome://flags/#enable-webmcp-testing</code>'
				);
				?>
			</li>
			<li><?php esc_html_e( 'Install the Model Context Tool Inspector Chrome extension.', 'auto-webmcp' ); ?></li>
			<li><?php esc_html_e( 'Your forms will appear as registered AI tools in the inspector panel.', 'auto-webmcp' ); ?></li>
		</ol>
		<p>
			<a href="https://autowebmcp.dev" target="_blank" rel="noopener"><?php esc_html_e( 'Full documentation', 'auto-webmcp' ); ?> &rarr;</a>
			&nbsp;|&nbsp;
			<a href="https://autowebmcp.dev/platforms/wordpress" target="_blank" rel="noopener"><?php esc_html_e( 'WordPress install guide', 'auto-webmcp' ); ?> &rarr;</a>
		</p>
	</div>
	<?php
}
