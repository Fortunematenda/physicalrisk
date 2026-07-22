<?php
namespace MetForm\Core\Forms;
defined( 'ABSPATH' ) || exit;

Class Base extends \MetForm\Base\Common{

    use \MetForm\Traits\Singleton;

    public $form;

    public $api;

    public function get_dir(){
        return dirname(__FILE__);
    }

    public function __construct(){
    }

    public function init(){
        $this->form = new Cpt();
        $this->api = new Api();
        Hooks::instance()->Init();
        \MetForm\Base\Shortcode::instance();

        add_action('admin_footer', [$this, 'modal_view']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_react_modal_scripts']);
    }

    public function modal_view(){

        $screen = get_current_screen();

        if($screen->id == 'edit-metform-form' || $screen->id == 'metform_page_mt-form-settings'){
            include_once 'views/modal-editor.php';

            // Include new modal for add new form
            include_once 'views/modal-add-new-form.php';
        }
    }

    public function enqueue_react_modal_scripts(){
        $screen = get_current_screen();
        $settings = get_option('metform_option__settings', []);
       // $formAnalyticsEnabled = class_exists('\MetForm_Pro\Plugin') && (\MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier()) && !empty($settings['mf_enable_form_analytics']);
        // Only enqueue on metform-form post type edit page
        if($screen->id == 'edit-metform-form'){
            $plugin = \MetForm\Plugin::instance();
            $asset_file = $plugin->plugin_dir() . 'build/add-new-form-modal.asset.php';

            if (file_exists($asset_file)) {
                $asset = include $asset_file;
                
                wp_enqueue_script(
                    'metform-add-new-form-modal',
                    $plugin->plugin_url() . 'build/add-new-form-modal.js',
                    $asset['dependencies'],
                    $asset['version'],
                    true
                );

                wp_set_script_translations('metform-add-new-form-modal', 'metform');

                wp_enqueue_style(
                    'metform-add-new-form-modal',
                    $plugin->plugin_url() . 'build/style-add-new-form-modal.css',
                    array('wp-components'),
                    $asset['version']
                );

                // Pass data to JavaScript
                wp_localize_script('metform-add-new-form-modal', 'metformData', [
                    'pluginUrl' => $plugin->plugin_url(),
                    'hasPro' => class_exists('\MetForm_Pro\Base\Package'),
                    'hasQuiz' => class_exists('\MetForm_Pro\Core\Features\Quiz\Integration'),
                    'templates' => $this->get_templates_for_js(),
                    'wpVersion' => get_bloginfo('version'),
                ]);
            }
        }
        if ($screen->id == 'metform_page_metform-analytics') {
            $plugin = \MetForm\Plugin::instance();
            $asset_file = $plugin->plugin_dir() . 'build/form-analytics.asset.php';
            $is_analytics_enable = !empty($settings['mf_enable_form_analytics']);
            // analytics base class check as a pro activation
            $is_metform_pro_active = class_exists(\MetForm_Pro\Core\Analytics\Base::class);            
            $is_mid_tier =  \MetForm\Utils\Util::is_mid_tier();
            $is_top_tier =  \MetForm\Utils\Util::is_top_tier();
            if (file_exists($asset_file)) {
                $asset = include $asset_file;
                
                wp_enqueue_script(
                    'metform-form-analytics',
                    $plugin->plugin_url() . 'build/form-analytics.js',
                    $asset['dependencies'],
                    $asset['version'],
                    true
                );

                wp_enqueue_style(
                    'metform-form-analytics',
                    $plugin->plugin_url() . 'build/style-form-analytics.css',
                    array('wp-components'),
                    $asset['version']
                );
                wp_localize_script('metform-form-analytics', 'metformAnalytics', [
                    'apiUrl' => rest_url('metform-pro/v1/analytics'),
                    'nonce' => wp_create_nonce('wp_rest'),
                    'admin_url' => admin_url(),
                    'is_analytics_enable' => $is_analytics_enable,
                    'is_metform_pro_active' => $is_metform_pro_active,
                    'is_mid_tier' => $is_mid_tier,
                    'is_top_tier' => $is_top_tier,
                ]);
            }
        }
    }

    private function get_templates_for_js(){
        $templates = [];
        
        if(class_exists('\MetForm\Templates\Base')){
            $template_data = \MetForm\Templates\Base::instance()->get_templates();

            $pro_exists = class_exists('\MetForm_Pro\Base\Package');

            foreach($template_data as $template){
                if(isset($template['form_type'])){
                    $title = isset($template['title']) ? $template['title'] : '';
                    
                    $templates[] = [
                        'id' => isset($template['id']) ? $template['id'] : '',
                        'title' => $title,
                        'description' => isset($template['description']) ? $template['description'] : '',
                        'thumbnail' => isset($template['preview-thumb']) ? $template['preview-thumb'] : '',
                        'form_type' => $template['form_type'],
                        'category' => $this->detect_category($title),
                        'demoUrl' => isset($template['demo-url']) ? $template['demo-url'] : '',
                        'file' => isset($template['file']) ? $template['file'] : '',
                        'package' => isset($template['package']) ? $template['package'] : '',
                        'isProActive' => $pro_exists,
                    ];
                }
            }
        }
        
        return $templates;
    }

    private function detect_category($title){
        $title_lower = strtolower($title);
        
        // Map titles to categories
        if(strpos($title_lower, 'contact') !== false){
            return 'contact-form';
        } elseif(strpos($title_lower, 'conditional') !== false){
            return 'conditional-logic-form';
        } elseif(strpos($title_lower, 'quiz') !== false){
            return 'quiz-form';
        } elseif(strpos($title_lower, 'feedback') !== false || strpos($title_lower, 'suggestion') !== false || strpos($title_lower, 'rating') !== false){
            return 'feedback-form';
        } elseif(strpos($title_lower, 'calculation') !== false){
            return 'calculation-form';
        } elseif(strpos($title_lower, 'multi-step') !== false || strpos($title_lower, 'multistep') !== false){
            return 'multi-step-form';
        } elseif(strpos($title_lower, 'booking') !== false || strpos($title_lower, 'reservation') !== false || strpos($title_lower, 'event') !== false){
            return 'booking-form';
        } elseif(strpos($title_lower, 'order') !== false || strpos($title_lower, 'product') !== false || strpos($title_lower, 'food') !== false){
            return 'product-order-form';
        } elseif(strpos($title_lower, 'loan') !== false){
            return 'loan-application-form';
        } elseif(strpos($title_lower, 'job') !== false || strpos($title_lower, 'volunteer') !== false){
            return 'job-application-form';
        } elseif(strpos($title_lower, 'admission') !== false){
            return 'admission-form';
        } elseif(strpos($title_lower, 'support') !== false || strpos($title_lower, 'bug') !== false){
            return 'support-form';
        }
        
        return 'contact-form'; // Default category
    }
}
