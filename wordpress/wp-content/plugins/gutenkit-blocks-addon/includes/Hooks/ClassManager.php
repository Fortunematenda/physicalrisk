<?php

namespace Gutenkit\Hooks;

defined('ABSPATH') || exit;

use Gutenkit\Helpers\Utils;

class ClassManager
{

    use \Gutenkit\Traits\Singleton;

    private $classes = [];

    /**
     * class constructor.
     * private for singleton
     *
     * @return void
     * @since 1.0.0
     */
    public function __construct()
    {
        $active_modules = \Gutenkit\Config\Modules::get_active_modules_list();
        if (!empty($active_modules['class-manager']) && !is_admin()) {
            add_filter('gutenkit/generated_css', array($this, 'generate_css'), 10);
            add_filter("render_block", array($this, 'add_class_manager_attributes_on_save'), 10, 3);
            add_action('init', array($this, 'set_classes'));
        }
    }

    public function set_classes()
    {
        $classes = get_posts(array(
            'post_type' => 'class-manager',
            'posts_per_page' => -1
        ));

        $this->classes = $classes;
    }

    public function generate_css($css)
    {
        if (!empty($this->classes)) {
            $device_list = Utils::get_device_list();
            foreach ($this->classes as $index => $class) {
                // 🛠 Fetch Global Class Styles
                $class_styles = get_post_meta($class->ID, 'globalClassManagerStyle', true);

                $css_content = '';
                // Process Global Class Styles
                if (!empty($class_styles)) {
                    foreach ($device_list as $device) {
                        foreach ($class_styles as $key => $block) {
                            if (!empty($block) && trim($block) !== '') {
                                $direction = isset($device['direction']) ? $device['direction'] : 'max';
                                $width = isset($device['value']) ? $device['value'] : '';
                                $device_key = isset($device['slug']) ? strtolower($device['slug']) : '';

                                if (isset($device['value']) && $device['value'] == 'base' && $key == 'desktop') {
                                    $css_content .= $block;
                                } elseif (!empty($direction) && !empty($width) && $device_key == $key) {
                                    $css_content .= '@media (' . $direction . '-width: ' . $width . 'px) {' . trim($block) . '}';
                                }

                                if ($key == 'customStyles') {
                                    $css_content .= $block;
                                }
                            }
                        }
                    }
                }
                
                $css .= $css_content;
            }
        }
        return $css;
    }

    public function add_class_manager_attributes_on_save($block_content, $parsed_block)
    {
        if (Utils::is_gkit_block($block_content, $parsed_block, 'classLists')) {
            $class_lists = $parsed_block['attrs']['classLists'];
            if (!empty($class_lists)) {
                foreach ($class_lists as $class) {
                    $id = $class['id'];
                    $name = $class['title'];
                    $class_post = get_post($id);
                    if (!empty($class_post) && $class_post->post_status == 'publish' && !empty($name)) {
                        $tag = new \WP_HTML_Tag_Processor($block_content);
                        $tag->next_tag();
                        $tag->add_class($name);
                        $block_content = $tag->get_updated_html();
                    }
                }
            }
        }
        return $block_content;
    }
}
