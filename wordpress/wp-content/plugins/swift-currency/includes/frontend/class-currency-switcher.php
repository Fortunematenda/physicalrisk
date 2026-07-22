<?php

/**
 * Currency Switcher Class
 *
 * Handles the frontend currency switcher widget and shortcode.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\Frontend;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * Currency Switcher class.
 *
 * @class Currency_Switcher
 * @version 1.0.0
 */
class Currency_Switcher
{

	/**
	 * Currency Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Allowed HTML for currency switcher output.
	 *
	 * @var array
	 */
	private $allowed_html;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 */
	public function __construct($currency_manager, $settings)
	{
		$this->currency_manager = $currency_manager;
		$this->settings         = $settings;
		$this->init_allowed_html();
		$this->init_hooks();
	}

	/**
	 * Initialize the allowed HTML whitelist for wp_kses output.
	 * Centralised so it is defined once and reused everywhere.
	 */
	private function init_allowed_html()
	{
		$this->allowed_html = array(
			// Structural containers.
			'div'      => array(
				'class'        => true,
				'id'           => true,
				'style'        => true,
				'role'         => true,
				'aria-label'   => true,
				'data-currency'   => true,
				'data-show-flags' => true,
			),
			'ul'       => array(
				'class' => true,
				'role'  => true,
			),
			'li'       => array(
				'class'         => true,
				'role'          => true,
				'aria-selected' => true,
				'style'         => true,
			),
			// Interactive elements.
			'button'   => array(
				'type'          => true,
				'class'         => true,
				'aria-haspopup' => true,
				'aria-expanded' => true,
				'aria-pressed'  => true,
				'data-currency' => true,
				'title'         => true,
			),
			'a'        => array(
				'href'          => true,
				'class'         => true,
				'data-currency' => true,
			),
			'select'   => array(
				'class'      => true,
				'name'       => true,
				'aria-hidden' => true,
				'aria-label' => true,
				'tabindex'   => true,
				'data-behaviour' => true,
			),
			'option'   => array(
				'value'    => true,
				'selected' => true,
			),
			// Inline / typographic.
			'span'     => array(
				'class' => true,
			),
			// SVG elements.
			'svg'      => array(
				'class'           => true,
				'xmlns'           => true,
				'width'           => true,
				'height'          => true,
				'viewbox'         => true,
				'fill'            => true,
				'stroke'          => true,
				'stroke-width'    => true,
				'stroke-linecap'  => true,
				'stroke-linejoin' => true,
			),
			'polyline' => array(
				'points' => true,
			),
		);
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks()
	{
		// Register shortcode.
		add_shortcode('swiftcurrency_switcher', array($this, 'switcher_shortcode'));

		// AJAX parameters.
		add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));

		// Inject an early inline script so geolocation works even when a
		// full-page cache plugin serves a stale cached page to a new visitor.
		// Priority 1 ensures it runs before any script-deferral optimisations.
		if ($this->settings->get('general', 'auto_detect_currency', false)) {
			add_action('wp_head', array($this, 'render_geo_bootstrap_script'), 1);
		}

		// --- Placement: Site Header ---
		if ($this->settings->get('display', 'placement_header', false)) {
			add_action('wp_body_open', array($this, 'render_header_bar'), 5);
			add_action('get_header',   array($this, 'render_header_bar_fallback'), 5);
		}

		// --- Placement: Navigation Menu (appended to primary menu items) ---
		if ($this->settings->get('display', 'placement_nav', false)) {
			add_filter('wp_nav_menu_items', array($this, 'add_to_nav_menu'), 10, 2);
		}

		// --- Placement: WooCommerce Cart & Checkout ---
		if ($this->settings->get('display', 'placement_cart', false)) {
			add_action('woocommerce_before_cart_totals',           array($this, 'render_inline_switcher'));
			add_action('woocommerce_checkout_before_order_review', array($this, 'render_inline_switcher'));
		}

		// --- Placement: Site Footer ---
		if ($this->settings->get('display', 'placement_footer', false)) {
			add_action('wp_footer', array($this, 'render_footer_bar'), 20);
		}

		// --- Placement: Sticky Side Widget ---
		if ($this->settings->get('display', 'placement_sticky', false)) {
			add_action('wp_footer', array($this, 'render_sticky_widget'), 25);
		}
	}

	/**
	 * Inject a tiny inline script early in <head> for page-cache compatibility.
	 *
	 * Full-page cache plugins (WP Rocket, LiteSpeed Cache, WP Super Cache,
	 * W3 Total Cache, NitroPack, Cloudflare APO, etc.) may serve a cached
	 * HTML snapshot to all visitors — bypassing PHP entirely on cache hit.
	 * This means the PHP geolocation logic never runs for cached requests.
	 *
	 * This script solves the problem universally by:
	 * 1. Checking if the `swiftcurrency_selected` cookie already exists.
	 *    If it does, the user is a returning visitor and the cache is correct.
	 * 2. If no cookie exists (genuine first visit), it fires a lightweight
	 *    AJAX call to `admin-ajax.php` (which always bypasses page caches).
	 * 3. The AJAX endpoint runs the full server-side geolocation, returns
	 *    the detected currency code, and the script sets the cookie.
	 * 4. If the detected currency differs from the page's base currency,
	 *    the script triggers a single transparent reload — the reload sends
	 *    the cookie so PHP renders the correct currency on the next request.
	 *
	 * This approach is cache-agnostic: it works with any caching solution
	 * because AJAX POST requests to admin-ajax.php are universally excluded
	 * from page caches by all WordPress caching plugins.
	 *
	 * @since 1.0.0
	 */
	public function render_geo_bootstrap_script()
	{
		// Only inject when geolocation Pro class is available.
		if (! class_exists('Codeies\\SwiftCurrency\\Pro\\Geolocation')) {
			return;
		}
		if (is_admin()) {
			return;
		}

		$ajax_url    = esc_url(admin_url('admin-ajax.php'));
		$base_curr   = esc_js($this->currency_manager->get_base_currency());
		$cookie_days = (int) $this->settings->get('advanced', 'cookie_duration', 30);
		$cookie_path = esc_js(COOKIEPATH ?: '/');
		$cookie_dom  = esc_js(COOKIE_DOMAIN ?: '');
		?>
<script id="swiftcurrency-geo-bootstrap" data-cfasync="false" data-no-optimize="1" data-minify="false" data-nitro-exclude="1" nitro-exclude>
(function(){
	// If a currency cookie already exists the user is returning — nothing to do.
	if (document.cookie.indexOf('swiftcurrency_selected=') !== -1) return;
	// Guard against duplicate execution (some optimisers may re-inject scripts).
	if (window._scGeoRunning) return;
	window._scGeoRunning = true;

	var xhr = new XMLHttpRequest();
	xhr.open('POST', '<?php echo $ajax_url; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>', true);
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.timeout = 5000;
	xhr.onreadystatechange = function() {
		if (xhr.readyState !== 4 || xhr.status !== 200) return;
		try {
			var r = JSON.parse(xhr.responseText);
			if (r && r.success && r.data && r.data.currency) {
				var cur = r.data.currency;
				// Set the cookie so the next request (the reload) carries it.
				var exp = new Date();
				exp.setDate(exp.getDate() + <?php echo (int) $cookie_days; ?>);
				var parts = 'swiftcurrency_selected=' + cur
					+ '; expires=' + exp.toUTCString()
					+ '; path=<?php echo $cookie_path; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>'
					+ '; SameSite=Lax';
				<?php if (! empty($cookie_dom)) : ?>
				parts += '; domain=<?php echo $cookie_dom; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>';
				<?php endif; ?>
				document.cookie = parts;
				// Reload only when the detected currency differs from the base
				// currency rendered in this (possibly cached) page.
				if (cur !== '<?php echo $base_curr; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>') {
					window.location.reload();
				}
			}
		} catch(e) {}
	};
	xhr.send('action=swiftcurrency_geo_detect');
})();
</script>
		<?php
	}

	/* ----------------------------------------------------------------
	 * Enqueue Scripts / Styles
	 * ---------------------------------------------------------------- */

	/**
	 * Enqueue scripts and styles.
	 */
	public function enqueue_scripts()
	{
		// Register CSS.
		wp_register_style(
			'swiftcurrency-frontend',
			SWIFTCURRENCY_ASSETS_URL . 'css/frontend.css',
			array(),
			SWIFTCURRENCY_VERSION
		);

		// Register JS.
		wp_register_script(
			'swiftcurrency-switcher',
			SWIFTCURRENCY_ASSETS_URL . 'js/currency-switcher.js',
			array('jquery'),
			SWIFTCURRENCY_VERSION,
			true
		);

		// Enqueue.
		wp_enqueue_style('swiftcurrency-frontend');
		wp_enqueue_script('swiftcurrency-switcher');

		/*
		 * Security: Generate a single nonce and share it via wp_localize_script only.
		 * Avoid duplicating nonce output via wp_add_inline_script to prevent double
		 * exposure. The inline script below is kept only for legacy JS compatibility
		 * but uses the same nonce value — it is NOT a second nonce creation.
		 */
		$nonce = wp_create_nonce('swiftcurrency_nonce');

		// Inline nonce variable for legacy scripts that reference window.swiftcurrency_nonce directly.
		// esc_js() prevents XSS if the nonce string ever contains unexpected characters.
		$nonce_script = "var swiftcurrency_nonce = '" . esc_js($nonce) . "';";
		wp_add_inline_script('swiftcurrency-switcher', $nonce_script, 'before');

		// Localize script — all values sanitized before passing.
		wp_localize_script(
			'swiftcurrency-switcher',
			'swiftcurrency_params',
			array(
				'ajax_url'         => esc_url(admin_url('admin-ajax.php')),
				'nonce'            => $nonce,
				// sanitize_text_field strips tags/extra whitespace from the currency code.
				'current_currency' => sanitize_text_field($this->get_current_currency()),
				// translatable string is safe; esc_html applied by JS consumer, but
				// wp_strip_all_tags removes any stray markup injected via translation.
				'switching_text'   => wp_strip_all_tags(__('Switching currency...', 'swift-currency')),
			)
		);

		// Inject accent color as CSS variable.
		// sanitize_hex_color() returns '' for invalid values, so we guard with !empty().
		$raw_accent    = $this->settings->get('display', 'accent_color', '#0073aa');
		$accent_color  = sanitize_hex_color($raw_accent);
		if (! empty($accent_color)) {
			// Color value already validated as a hex string — safe to embed directly.
			$color_css = ':root { --swiftcurrency-accent: ' . $accent_color . '; }';
			wp_add_inline_style('swiftcurrency-frontend', $color_css);
		}

		/*
		 * Inject custom flag CSS for user-defined currencies.
		 *
		 * Security checklist:
		 *  - sanitize_key()  : ensures the currency code is [a-z0-9_-] only → safe CSS class name.
		 *  - strtolower()    : normalise for consistency.
		 *  - esc_url()       : encodes special characters in the flag URL → safe inside CSS url().
		 *  - No user-supplied string is concatenated raw into the CSS block.
		 */
		$custom_currencies = get_option('swiftcurrency_custom_currencies', array());
		if (! empty($custom_currencies) && is_array($custom_currencies)) {
			$flags_css = '';
			foreach ($custom_currencies as $code => $data) {
				if (empty($data['flag_url'])) {
					continue;
				}
				$safe_code  = strtolower(sanitize_key($code));
				$safe_url   = esc_url($data['flag_url']);

				// Both variables are sanitized — concatenation is safe.
				$flags_css .= ".swiftcurrency-flag-{$safe_code} { "
					. "background-image: url('" . $safe_url . "') !important; "
					. "background-position: center !important; "
					. "background-size: cover !important; }\n";
			}
			if (! empty($flags_css)) {
				wp_add_inline_style('swiftcurrency-frontend', $flags_css);
			}
		}
	}

	/* ----------------------------------------------------------------
	 * Global Display Args
	 * ---------------------------------------------------------------- */

	/**
	 * Get global display args for the switcher.
	 *
	 * @param string $location Location identifier.
	 * @return array
	 */
	private function global_args($location = '')
	{
		$style = $this->settings->get('display', 'switcher_style', 'dropdown');
		if (! empty($location)) {
			// sanitize_key prevents arbitrary option key injection.
			$loc_style = $this->settings->get('display', 'loc_style_' . sanitize_key($location), '');
			if (! empty($loc_style)) {
				$style = $loc_style;
			}
		}

		return array(
			'style'       => sanitize_text_field($style),
			'show_flags'  => (bool) $this->settings->get('display', 'show_flags', true),
			'show_code'   => (bool) $this->settings->get('display', 'show_currency_code', true),
			'show_symbol' => (bool) $this->settings->get('display', 'show_currency_symbol', false),
			'show_name'   => (bool) $this->settings->get('display', 'show_currency_name', false),
		);
	}

	/* ----------------------------------------------------------------
	 * Placement Renderers
	 * ---------------------------------------------------------------- */

	/**
	 * Render a thin switcher bar at the top of the page body (header placement).
	 * Called via wp_body_open (modern themes support this hook).
	 */
	public function render_header_bar()
	{
		if (did_action('swiftcurrency_header_rendered')) {
			return;
		}
		do_action('swiftcurrency_header_rendered');
?>
		<div class="swiftcurrency-header-bar">
			<div class="swiftcurrency-header-bar-inner">
				<?php echo wp_kses($this->render_switcher($this->global_args('header')), $this->allowed_html); ?>
			</div>
		</div>
	<?php
	}

	/**
	 * Fallback header renderer for themes that don't call wp_body_open.
	 */
	public function render_header_bar_fallback()
	{
		if (did_action('wp_body_open') || did_action('swiftcurrency_header_rendered')) {
			return;
		}
		$this->render_header_bar();
	}

	/**
	 * Append currency switcher to the primary navigation menu.
	 *
	 * @param string   $items HTML string of nav menu items.
	 * @param stdClass $args  Nav menu args object.
	 * @return string
	 */
	public function add_to_nav_menu($items, $args)
	{
		if (! isset($args->theme_location) || 'primary' !== $args->theme_location) {
			return $items;
		}
		// wp_kses restricts switcher HTML to our whitelist before embedding in nav.
		$switcher = wp_kses($this->render_switcher($this->global_args('nav')), $this->allowed_html);
		$items   .= '<li class="menu-item swiftcurrency-nav-item" style="display:flex;align-items:center;">'
			. $switcher
			. '</li>';
		return $items;
	}

	/**
	 * Render inline switcher (used for WooCommerce cart/checkout hooks).
	 */
	public function render_inline_switcher()
	{
		echo '<div class="swiftcurrency-inline-placement" style="margin-bottom:12px;">';
		echo wp_kses($this->render_switcher($this->global_args('cart')), $this->allowed_html);
		echo '</div>';
	}

	/**
	 * Render a footer bar with the switcher.
	 */
	public function render_footer_bar()
	{
	?>
		<div class="swiftcurrency-footer-bar">
			<div class="swiftcurrency-footer-bar-inner">
				<span class="swiftcurrency-footer-label"><?php esc_html_e('Select Currency:', 'swift-currency'); ?></span>
				<?php echo wp_kses($this->render_switcher($this->global_args('footer')), $this->allowed_html); ?>
			</div>
		</div>
	<?php
	}

	/**
	 * Render the sticky floating side widget via wp_footer.
	 */
	public function render_sticky_widget()
	{
		// Validate sticky_side against allowed values; default to 'right'.
		$raw_side = $this->settings->get('display', 'sticky_side', 'right');
		$side     = in_array($raw_side, array('left', 'right'), true) ? $raw_side : 'right';
		$offset   = absint($this->settings->get('display', 'sticky_offset', 40));

		// Strip all HTML from the admin-supplied label — it is output inside a <div>.
		$label   = wp_strip_all_tags($this->settings->get('display', 'sticky_label', ''));
		$pos_css = ('left' === $side) ? 'left:0;' : 'right:0;';
		$args    = $this->global_args('sticky');
	?>
		<div class="swiftcurrency-sticky-widget"
			id="swiftcurrency-sticky-widget"
			style="<?php echo esc_attr($pos_css); ?>bottom:<?php echo esc_attr($offset); ?>%;">
			<?php if (! empty($label)) : ?>
				<div class="swiftcurrency-sticky-label"><?php echo esc_html($label); ?></div>
			<?php endif; ?>
			<div class="swiftcurrency-sticky-body">
				<?php echo wp_kses($this->render_switcher($args), $this->allowed_html); ?>
			</div>
		</div>
	<?php
	}

	/* ----------------------------------------------------------------
	 * Shortcode
	 * ---------------------------------------------------------------- */

	/**
	 * Currency switcher shortcode.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string Switcher HTML.
	 */
	public function switcher_shortcode($atts)
	{
		$atts = shortcode_atts(
			array(
				'style'        => $this->settings->get('display', 'switcher_style', 'dropdown'),
				'show_flags'   => $this->settings->get('display', 'show_flags', true) ? 'true' : 'false',
				'show_code'    => $this->settings->get('display', 'show_currency_code', true) ? 'true' : 'false',
				'show_symbol'  => $this->settings->get('display', 'show_currency_symbol', false) ? 'true' : 'false',
				'show_name'    => $this->settings->get('display', 'show_currency_name', false) ? 'true' : 'false',
				'include_base' => 'true',
			),
			$atts,
			'swiftcurrency_switcher'
		);

		// Sanitize style against known allowed values to prevent arbitrary class/logic injection.
		$allowed_styles = array(
			'dropdown',
			'pill_dropdown',
			'list',
			'native_select',
			'buttons',
			'segmented',
			'chips',
			'stack',
			'glass_float',
			'neon',
		);
		if (! in_array($atts['style'], $allowed_styles, true)) {
			$atts['style'] = 'dropdown';
		}

		// Check if we have enabled currencies.
		$include_base = filter_var($atts['include_base'], FILTER_VALIDATE_BOOLEAN);
		$currencies   = $this->get_enabled_currencies($include_base);
		if (empty($currencies)) {
			if (current_user_can('manage_options')) {
				return '<div class="swiftcurrency-notice">'
					. esc_html__('SwiftCurrency: No currencies enabled. Please enable currencies in the plugin settings.', 'swift-currency')
					. '</div>';
			}
			return '';
		}

		// wp_kses applied at output boundary; shortcode return value is echoed by WP core.
		return wp_kses($this->render_switcher($atts), $this->allowed_html);
	}

	/* ----------------------------------------------------------------
	 * Switcher Renderers
	 * ---------------------------------------------------------------- */

	/**
	 * Render currency switcher.
	 *
	 * @param array $args Switcher arguments.
	 * @return string Switcher HTML.
	 */
	public function render_switcher($args = array())
	{
		$defaults = array(
			'style'        => $this->settings->get('display', 'switcher_style', 'dropdown'),
			'show_flags'   => $this->settings->get('display', 'show_flags', true),
			'show_code'    => $this->settings->get('display', 'show_currency_code', true),
			'show_symbol'  => $this->settings->get('display', 'show_currency_symbol', false),
			'show_name'    => $this->settings->get('display', 'show_currency_name', false),
			'include_base' => true,
		);

		$args = wp_parse_args($args, $defaults);

		// Convert string booleans to proper booleans.
		$args['show_flags']   = filter_var($args['show_flags'],   FILTER_VALIDATE_BOOLEAN);
		$args['show_code']    = filter_var($args['show_code'],    FILTER_VALIDATE_BOOLEAN);
		$args['show_symbol']  = filter_var($args['show_symbol'],  FILTER_VALIDATE_BOOLEAN);
		$args['show_name']    = filter_var($args['show_name'],    FILTER_VALIDATE_BOOLEAN);
		$args['include_base'] = filter_var($args['include_base'], FILTER_VALIDATE_BOOLEAN);

		// Validate style against whitelist.
		$allowed_styles = array(
			'dropdown',
			'pill_dropdown',
			'list',
			'native_select',
			'buttons',
			'segmented',
			'chips',
			'stack',
			'glass_float',
			'neon',
		);
		if (! in_array($args['style'], $allowed_styles, true)) {
			$args['style'] = 'dropdown';
		}

		ob_start();

		switch ($args['style']) {
			case 'pill_dropdown':
				$this->render_dropdown($args);
				break;
			case 'list':
				$this->render_list($args);
				break;
			case 'native_select':
				$this->render_native_select($args);
				break;
			case 'buttons':
				$this->render_buttons($args);
				break;
			case 'segmented':
				$this->render_segmented($args);
				break;
			case 'chips':
				$this->render_chips($args);
				break;
			case 'stack':
				$this->render_stack($args);
				break;
			case 'glass_float':
				$this->render_glass_float($args);
				break;
			case 'neon':
				$this->render_neon($args);
				break;
			case 'dropdown':
			default:
				$this->render_dropdown($args);
		}

		return ob_get_clean();
	}

	/**
	 * Render dropdown style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_dropdown($args)
	{
		$currencies   = $this->get_enabled_currencies($args['include_base']);
		$current      = $this->get_current_currency();
		$current_data = $this->currency_manager->get_currency($current);
		$show_flags   = $args['show_flags'];
		$extra_class  = ($args['style'] === 'pill_dropdown') ? 'is-pill' : '';
	?>
		<div class="swiftcurrency-switcher swiftcurrency-dropdown-fancy <?php echo esc_attr($extra_class); ?>"
			data-show-flags="<?php echo esc_attr( $show_flags ? '1' : '0' ); ?>">
			<button type="button" class="swiftcurrency-trigger" aria-haspopup="listbox" aria-expanded="false">
				<?php if ($show_flags) : ?>
					<span class="swiftcurrency-flag swiftcurrency-flag-<?php echo esc_attr(strtolower($current)); ?>"></span>
				<?php endif; ?>
				<span class="swiftcurrency-trigger-text">
					<?php echo esc_html($this->format_currency_label($current, $current_data, $args)); ?>
				</span>
				<svg class="swiftcurrency-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
					viewBox="0 0 24 24" fill="none" stroke="currentColor"
					stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="6 9 12 15 18 9"></polyline>
				</svg>
			</button>
			<div class="swiftcurrency-panel" role="listbox">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php
					// Validate $code is a plain currency code (letters/digits only).
					$safe_code = sanitize_text_field($code);
					$is_active = ($current === $safe_code);
					?>
					<div class="swiftcurrency-option <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
						role="option"
						aria-selected="<?php echo esc_attr( $is_active ? 'true' : 'false' ); ?>"
						data-currency="<?php echo esc_attr($safe_code); ?>">
						<?php if ($show_flags) : ?>
							<span class="swiftcurrency-flag swiftcurrency-flag-<?php echo esc_attr(strtolower($safe_code)); ?>"></span>
						<?php endif; ?>
						<span class="swiftcurrency-option-label">
							<?php echo esc_html($this->format_currency_label($safe_code, $currency, $args)); ?>
						</span>
						<?php if ($is_active) : ?>
							<svg class="swiftcurrency-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
								viewBox="0 0 24 24" fill="none" stroke="currentColor"
								stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="20 6 9 17 4 12"></polyline>
							</svg>
						<?php endif; ?>
					</div>
				<?php endforeach; ?>
			</div>
			<?php /* Hidden select for form/accessibility compatibility */ ?>
			<select class="swiftcurrency-select swiftcurrency-sr-only"
				name="swiftcurrency_currency"
				aria-hidden="true"
				tabindex="-1">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php $safe_code = sanitize_text_field($code); ?>
					<option value="<?php echo esc_attr($safe_code); ?>" <?php selected($current, $safe_code); ?>>
						<?php echo esc_html($this->format_currency_label($safe_code, $currency, $args)); ?>
					</option>
				<?php endforeach; ?>
			</select>
		</div>
	<?php
	}

	/**
	 * Render list style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_list($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-list">
			<ul class="swiftcurrency-currency-list" role="listbox">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php
					$safe_code = sanitize_text_field($code);
					$is_active = ($current === $safe_code);
					?>
					<li class="swiftcurrency-currency-item <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
						role="option"
						aria-selected="<?php echo esc_attr( $is_active ? 'true' : 'false' ); ?>">
						<a href="#" class="swiftcurrency-currency-link" data-currency="<?php echo esc_attr($safe_code); ?>">
							<?php if ($args['show_flags']) : ?>
								<span class="swiftcurrency-flag swiftcurrency-flag-<?php echo esc_attr(strtolower($safe_code)); ?>"></span>
							<?php endif; ?>
							<span class="swiftcurrency-currency-text">
								<?php echo esc_html($this->format_currency_label($safe_code, $currency, $args)); ?>
							</span>
							<?php if ($is_active) : ?>
								<svg class="swiftcurrency-check" xmlns="http://www.w3.org/2000/svg" width="13" height="13"
									viewBox="0 0 24 24" fill="none" stroke="currentColor"
									stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							<?php endif; ?>
						</a>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
	<?php
	}

	/**
	 * Render native select style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_native_select($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-native-select">
			<select class="swiftcurrency-select-native"
				aria-label="<?php esc_attr_e('Select Currency', 'swift-currency'); ?>"
				data-behaviour="swiftcurrency-auto">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php $safe_code = sanitize_text_field($code); ?>
					<option value="<?php echo esc_attr($safe_code); ?>" <?php selected($current, $safe_code); ?>>
						<?php echo esc_html($this->format_currency_label($safe_code, $currency, $args)); ?>
					</option>
				<?php endforeach; ?>
			</select>
		</div>
	<?php
	}

	/**
	 * Render buttons style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_buttons($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-buttons"
			role="group"
			aria-label="<?php esc_attr_e('Select currency', 'swift-currency'); ?>">
			<?php foreach ($currencies as $code => $currency) : ?>
				<?php
				$safe_code = sanitize_text_field($code);
				$is_active = ($current === $safe_code);
				// Currency name used only in a title attribute — no HTML needed.
				$safe_name = isset($currency['name']) ? sanitize_text_field($currency['name']) : $safe_code;
				?>
				<button
					type="button"
					class="swiftcurrency-button <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
					data-currency="<?php echo esc_attr($safe_code); ?>"
					aria-pressed="<?php echo esc_attr( $is_active ? 'true' : 'false' ); ?>"
					title="<?php echo esc_attr($safe_name); ?>">
					<?php if ($args['show_flags']) : ?>
						<span class="swiftcurrency-flag swiftcurrency-flag-<?php echo esc_attr(strtolower($safe_code)); ?>"></span>
					<?php endif; ?>
					<span class="swiftcurrency-button-text">
						<?php echo esc_html($this->format_currency_label($safe_code, $currency, $args)); ?>
					</span>
				</button>
			<?php endforeach; ?>
		</div>
	<?php
	}

	/**
	 * Render segmented style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_segmented($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-segmented">
			<div class="swiftcurrency-segmented-inner">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php
					$safe_code = sanitize_text_field($code);
					$is_active = ($current === $safe_code);
					?>
					<button type="button"
						class="swiftcurrency-segment <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
						data-currency="<?php echo esc_attr($safe_code); ?>">
						<?php echo esc_html($safe_code); ?>
					</button>
				<?php endforeach; ?>
			</div>
		</div>
	<?php
	}

	/**
	 * Render chips style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_chips($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-chips">
			<?php foreach ($currencies as $code => $currency) : ?>
				<?php
				$safe_code = sanitize_text_field($code);
				$is_active = ($current === $safe_code);
				?>
				<div class="swiftcurrency-chip <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
					data-currency="<?php echo esc_attr($safe_code); ?>">
					<?php if ($args['show_flags']) : ?>
						<span class="swiftcurrency-flag swiftcurrency-flag-<?php echo esc_attr(strtolower($safe_code)); ?>"></span>
					<?php endif; ?>
					<span class="swiftcurrency-chip-text"><?php echo esc_html($safe_code); ?></span>
				</div>
			<?php endforeach; ?>
		</div>
	<?php
	}

	/**
	 * Render stack style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_stack($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-stack">
			<?php foreach ($currencies as $code => $currency) : ?>
				<?php
				$safe_code   = sanitize_text_field($code);
				$safe_name   = isset($currency['name'])   ? sanitize_text_field($currency['name'])   : '';
				$safe_symbol = isset($currency['symbol']) ? sanitize_text_field($currency['symbol']) : '';
				$is_active   = ($current === $safe_code);
				?>
				<div class="swiftcurrency-stack-item <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
					data-currency="<?php echo esc_attr($safe_code); ?>">
					<div class="swiftcurrency-stack-left">
						<span class="swiftcurrency-stack-code"><?php echo esc_html($safe_code); ?></span>
						<span class="swiftcurrency-stack-name"><?php echo esc_html($safe_name); ?></span>
					</div>
					<div class="swiftcurrency-stack-right">
						<span class="swiftcurrency-stack-symbol"><?php echo esc_html($safe_symbol); ?></span>
					</div>
				</div>
			<?php endforeach; ?>
		</div>
	<?php
	}

	/**
	 * Render glass float style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_glass_float($args)
	{
		$currencies   = $this->get_enabled_currencies($args['include_base']);
		$current      = $this->get_current_currency();
		$current_data = $this->currency_manager->get_currency($current);
		// Symbol used in visible text context — esc_html handles output.
		$current_symbol = isset($current_data['symbol']) ? sanitize_text_field($current_data['symbol']) : '';
	?>
		<div class="swiftcurrency-switcher swiftcurrency-glass-float">
			<button type="button" class="swiftcurrency-float-trigger">
				<?php echo esc_html($current_symbol); ?>
			</button>
			<div class="swiftcurrency-float-panel">
				<?php foreach ($currencies as $code => $currency) : ?>
					<?php
					$safe_code   = sanitize_text_field($code);
					$safe_symbol = isset($currency['symbol']) ? sanitize_text_field($currency['symbol']) : '';
					$is_active   = ($current === $safe_code);
					?>
					<div class="swiftcurrency-float-option <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
						data-currency="<?php echo esc_attr($safe_code); ?>">
						<span class="swiftcurrency-float-code"><?php echo esc_html($safe_code); ?></span>
						<span class="swiftcurrency-float-symbol"><?php echo esc_html($safe_symbol); ?></span>
					</div>
				<?php endforeach; ?>
			</div>
		</div>
	<?php
	}

	/**
	 * Render neon style switcher.
	 *
	 * @param array $args Switcher arguments.
	 */
	private function render_neon($args)
	{
		$currencies = $this->get_enabled_currencies($args['include_base']);
		$current    = $this->get_current_currency();
	?>
		<div class="swiftcurrency-switcher swiftcurrency-neon">
			<?php foreach ($currencies as $code => $currency) : ?>
				<?php
				$safe_code = sanitize_text_field($code);
				$is_active = ($current === $safe_code);
				?>
				<div class="swiftcurrency-neon-tag <?php echo esc_attr($is_active ? 'is-active' : ''); ?>"
					data-currency="<?php echo esc_attr($safe_code); ?>">
					<?php echo esc_html($safe_code); ?>
				</div>
			<?php endforeach; ?>
		</div>
<?php
	}

	/* ----------------------------------------------------------------
	 * Helpers
	 * ---------------------------------------------------------------- */

	/**
	 * Format currency label based on display settings.
	 *
	 * @param string $code     Currency code.
	 * @param array  $currency Currency data.
	 * @param array  $args     Display arguments.
	 * @return string Formatted label (plain text, caller must esc_html on output).
	 */
	private function format_currency_label($code, $currency, $args)
	{
		if (empty($currency)) {
			return sanitize_text_field($code);
		}

		$parts = array();

		if ($args['show_code']) {
			$parts[] = sanitize_text_field($code);
		}

		if ($args['show_symbol'] && isset($currency['symbol'])) {
			$parts[] = sanitize_text_field($currency['symbol']);
		}

		if ($args['show_name'] && isset($currency['name'])) {
			$parts[] = sanitize_text_field($currency['name']);
		}

		if (empty($parts)) {
			$parts[] = sanitize_text_field($code);
		}

		// Return plain text; caller is responsible for escaping on output.
		return implode(' · ', $parts);
	}

	/**
	 * Get enabled currencies.
	 *
	 * @param bool $include_base Whether to include base currency even if not enabled.
	 * @return array
	 */
	private function get_enabled_currencies($include_base = true)
	{
		$currencies = $this->currency_manager->get_enabled_currencies();

		if ($include_base) {
			$base_currency = $this->currency_manager->get_base_currency();

			if (! isset($currencies[$base_currency])) {
				$base_data = $this->currency_manager->get_currency($base_currency);

				if ($base_data) {
					$currencies = array($base_currency => $base_data) + $currencies;
				}
			}
		}

		return $currencies;
	}

	/**
	 * Get current currency.
	 *
	 * Reads from cookie → WooCommerce session → base currency fallback.
	 * Cookie value is sanitized before use to prevent header-injection or XSS.
	 *
	 * @return string Sanitized currency code.
	 */
	private function get_current_currency()
	{
		// Check cookie first.
		if (isset($_COOKIE['swiftcurrency_selected'])) {
			/*
			 * sanitize_text_field() strips tags, extra whitespace, and invalid
			 * UTF-8 sequences. Currency codes are short alpha strings so this is
			 * more than sufficient without being overly restrictive.
			 */
			return sanitize_text_field(wp_unslash($_COOKIE['swiftcurrency_selected']));
		}

		// Check WooCommerce session.
		if (function_exists('WC') && WC()->session && WC()->session->get('swiftcurrency_current')) {
			return sanitize_text_field(WC()->session->get('swiftcurrency_current'));
		}

		// Fallback to base currency.
		return sanitize_text_field($this->currency_manager->get_base_currency());
	}
}
