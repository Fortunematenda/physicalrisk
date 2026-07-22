<?php
namespace MetForm\Core\Analytics;
defined( 'ABSPATH' ) || exit;

/**
 * Analytics Admin Page
 */
class Base {
    use \MetForm\Traits\Singleton;

    public function init() {
        add_action('admin_menu', [$this, 'register_analytics_menu'], 12);
    }

    /**
     * Register analytics menu after entries
     */
    public function register_analytics_menu() {
        // Hide the Analytics menu when form analytics is disabled in settings.
        if ( ! $this->should_show_menu() ) {
            return;
        }

        add_submenu_page(
            'metform-menu',
            esc_html__('Analytics', 'metform'),
            esc_html__('Analytics', 'metform'),
            'manage_options',
            'metform-analytics',
            [$this, 'render_analytics_page'],
            12 // Position after entries (entries is at 11)
        );
    }

    /**
     * Whether the Analytics menu should be shown.
     *
     * When Pro is not active the menu is always shown (regardless of the
     * setting). When Pro is active, the menu respects the
     * `mf_enable_form_analytics` setting and is hidden when disabled.
     * Defaults to enabled when the option has never been set.
     *
     * Additionally, when Pro is active on a mid-tier or top-tier license but
     * the Pro analytics implementation (MetForm_Pro\Core\Analytics\Base) is
     * missing (e.g. an older Pro build), the menu is hidden because there is
     * no Pro analytics functionality backing it.
     *
     * @return bool
     */
    private function should_show_menu() {
        // Without Pro the menu is always available.
        if ( ! class_exists( '\MetForm_Pro\Plugin' ) ) {
            return true;
        }

        // On mid/top tier Pro, hide the menu when the Pro analytics class is absent.
        if (
            ( \MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier() )
            && ! class_exists( '\MetForm_Pro\Core\Analytics\Base' )
        ) {
            return false;
        }

        $settings = get_option( 'metform_option__settings', [] );
        $settings = is_array( $settings ) ? $settings : [];

        if ( ! isset( $settings['mf_enable_form_analytics'] ) ) {
            return true;
        }

        return ! empty( $settings['mf_enable_form_analytics'] );
    }

    /**
     * Render analytics page
     */
    public function render_analytics_page() {
        ?>
        <div class="wrap">
            <div id="metform-analytics-root"></div>
        </div>
        <?php
    }
}
