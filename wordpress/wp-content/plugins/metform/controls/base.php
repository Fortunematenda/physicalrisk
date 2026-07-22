<?php 
namespace MetForm\Controls;

defined( 'ABSPATH' ) || exit;

class Base{

    use \MetForm\Traits\Singleton; 

    // Instance of all control's base class
    // ##readhere
    public static function get_url(){
        return \MetForm\Plugin::instance()->plugin_url() . 'controls/';
    }
    public static function get_dir(){
        return \MetForm\Plugin::instance()->plugin_dir() . 'controls/';
    }

    public function init() {

        // Includes necessary files
        $this->include_files();

        // Initilizating control hooks
        add_action('elementor/controls/controls_registered', array( $this, 'formpicker' ), 11 );

        // Initilizating control scripts
        add_action( 'elementor/frontend/after_enqueue_styles', array( $this, 'formpicker_enqueue_styles_editor' ), 11 );
        add_action( 'elementor/frontend/after_enqueue_scripts', array( $this, 'formpicker_enqueue_scripts_editor' ), 11 );

        // Enqueue React form-picker modal in the Elementor editor (parent window)
        add_action( 'elementor/editor/footer', array( $this, 'enqueue_form_picker_modal_react' ) );

        // Initilizating control classes
        $formpicker_utils = new Form_Picker_Utils();
        $formpicker_utils->init();

        // Admin Add New Form
        $admin_add_new_form_button = new Admin_Add_New_Form();
        $admin_add_new_form_button->init();
    }

    private function include_files(){
        // Controls_Manager
        include_once self::get_dir() . 'control-manager.php';

        // formpicker
        include_once self::get_dir() . 'form-picker-utils.php';
        include_once self::get_dir() . 'form-picker.php';
    }

    public function formpicker( $controls_manager ) {
        $controls_manager->register( new \MetForm\Controls\Form_Picker() );
    }
    
	public function formpicker_enqueue_scripts_editor() {

        if ( is_preview() || \Elementor\Plugin::$instance->preview->is_preview_mode() || ( class_exists('ReduxFramework') && get_stylesheet() == 'itfirm' ) ) {  //for itfirm theme the preview mode is not working, that is why for compatibility we are adding this condition
		    wp_enqueue_script( 'metform-js-formpicker-control-editor',  self::get_url() . 'assets/js/form-picker-editor.js', [], \MetForm\Plugin::instance()->version() );
        }
    }
    
	public function formpicker_enqueue_styles_editor() {
        if ( is_preview() || \Elementor\Plugin::$instance->preview->is_preview_mode() ) {
            wp_enqueue_style( 'metform-css-formpicker-control-editor',  self::get_url() . 'assets/css/form-picker-editor.css', [], '1.0.0' );
        }
    }

    /**
     * Enqueue the React-powered form-picker modal in the Elementor editor (parent window).
     */
    public function enqueue_form_picker_modal_react() {
        $plugin         = \MetForm\Plugin::instance();
        $asset_file     = $plugin->plugin_dir() . 'build/form-picker-modal.asset.php';
        $asset          = file_exists( $asset_file ) ? require( $asset_file ) : [ 'dependencies' => [], 'version' => '1.0.0' ];

        wp_enqueue_script(
            'metform-form-picker-modal-react',
            $plugin->plugin_url() . 'build/form-picker-modal.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        if ( file_exists( $plugin->plugin_dir() . 'build/style-form-picker-modal.css' ) ) {
            wp_enqueue_style(
                'metform-form-picker-modal-react-style',
                $plugin->plugin_url() . 'build/style-form-picker-modal.css',
                [],
                $asset['version']
            );
        }

        // Pass templates and saved forms to React
        $raw_templates = \MetForm\Templates\Base::instance()->get_templates();
        $templates     = array_values( array_map( function( $t ) {
            return [
                'id'        => isset( $t['id'] ) ? $t['id'] : '',
                'title'     => isset( $t['title'] ) ? $t['title'] : '',
                'package'   => isset( $t['package'] ) ? $t['package'] : 'free',
                'form_type' => isset( $t['form_type'] ) ? $t['form_type'] : 'general-form',
                'category'  => isset( $t['category'] ) ? $t['category'] : 'all',
                'thumbnail' => isset( $t['preview-thumb'] ) ? $t['preview-thumb'] : ( isset( $t['thumbnail'] ) ? $t['thumbnail'] : '' ),
                'demo_url'  => isset( $t['demo-url'] ) ? $t['demo-url'] : '',
                'file'      => isset( $t['file'] ) ? $t['file'] : '',
            ];
        }, $raw_templates ) );

        $form_posts = get_posts( [
            'post_type'   => 'metform-form',
            'post_status' => 'publish',
            'numberposts' => -1,
        ] );
        $saved_forms = array_map( function( $post ) {
            return [ 'id' => (string) $post->ID, 'title' => $post->post_title ];
        }, $form_posts );

        wp_localize_script( 'metform-form-picker-modal-react', 'metformPickerData', [
            'templates'  => $templates,
            'savedForms' => array_values( $saved_forms ),
            'restUrl'    => get_rest_url(),
            'nonce'      => wp_create_nonce( 'wp_rest' ),
            'hasPro' => class_exists('\MetForm_Pro\Base\Package'),
            'hasQuiz' => class_exists( '\MetForm_Pro\Core\Features\Quiz\Integration' ),
        ] );
    }

}
