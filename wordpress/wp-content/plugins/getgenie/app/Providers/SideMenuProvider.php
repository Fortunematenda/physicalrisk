<?php

namespace GenieAi\App\Providers;

use GenieAi\App\Services\RoleManager\RoleManager;

class SideMenuProvider
{

    public $menu_slug;
    private $role_manager;

    public function __construct()
    {
        $this->role_manager = new RoleManager();
        $this->initLeftSideMenu();
        add_action('admin_bar_menu', [$this, 'initTopBarMenu'], 100);
    }

    function initTopBarMenu($admin_bar){
        if(!is_user_logged_in() || !current_user_can('publish_posts')){
            return;
        }

        // Check AI Writing permission
        if($this->role_manager->is_allow_ai_writing()){
            $admin_bar->add_menu( array(
                'id'    => 'getgenie-template-list',
                'title' => 'GetGenie AI Writing',
                'href'  => admin_url('admin.php?page=getgenie#write-for-me'),
                'meta'  => array(   
                    'title' => __('GetGenie AI Writing', 'getgenie'),
                ),
            ));
        }

        $admin_bar->add_menu( array(
            'id'    => 'getgenie-chat',
            'title' => 'GenieChat',
            'href' => '#',
            'meta'  => array(   
                'title' => __('GetGenie Chat', 'getgenie'),
            ),
        ));
    }

    public function initLeftSideMenu(){
        $this->menu_slug = admin_url('admin.php?page=' .  GETGENIE_TEXTDOMAIN);

        add_action('admin_menu', function () {
            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                esc_html__("Get Genie | Getting Started", 'getgenie'),
                esc_html__("Getting Started", 'getgenie'),
                'publish_posts',
                $this->menu_slug.'#getting-started'
            );

            // Keyword Research - Check permission
            if($this->role_manager->is_allow_keyword_research()){
                add_submenu_page(
                    GETGENIE_TEXTDOMAIN,
                    esc_html__("Keyword Research | Get Genie", 'getgenie'),
                    esc_html__("Keyword Research", 'getgenie'),
                    'publish_posts',
                    $this->menu_slug.'#keyword-research'
                );
            }

            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                esc_html__("Get Genie | AI Writing", 'getgenie'),
                esc_html__("AI Writing", 'getgenie').'<span class="ai-writing-badge">New</span>',
                'publish_posts',
                $this->menu_slug.'#write-for-me'
            );

            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                __('SEO Insights', 'getgenie'),
               __('SEO Insights ', 'getgenie'),
                'publish_posts',
                $this->menu_slug.'#genie-ska'
            );

            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                esc_html__("Role Management | Get Genie", 'getgenie'),
                esc_html__("Role Management", 'getgenie'),
                'manage_options',
                $this->menu_slug.'#role-manager'
            );

            add_menu_page(
                esc_html__("Get Genie", 'getgenie'),
                esc_html__("Get Genie", 'getgenie'),
                'publish_posts',
                GETGENIE_TEXTDOMAIN,
                [$this, 'writeForMePageData'],
                 GETGENIE_URL.'/assets/dist/admin/images/genie-head.svg',
                5
            );

            // add_submenu_page(
            //     GETGENIE_TEXTDOMAIN,
            //     esc_html__("History | Get Genie", 'getgenie'),
            //     esc_html__("History", 'getgenie'),
            //     'publish_posts',
            //     $this->menu_slug.'#history'
            // );

            // add_submenu_page(
            //     GETGENIE_TEXTDOMAIN,
            //     esc_html__("Settings | Get Genie", 'getgenie'),
            //     esc_html__("Settings", 'getgenie'),
            //     'publish_posts',
            //     $this->menu_slug.'#settings', 
            // );

            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                esc_html__("License | Get Genie", 'getgenie'),
                esc_html__("License", 'getgenie'),
                'publish_posts',
                $this->menu_slug.'#license'
            );

            // add_submenu_page(
            //     GETGENIE_TEXTDOMAIN,
            //     esc_html__("Roadmap | Get Genie", 'getgenie'),
            //     esc_html__("Roadmap", 'getgenie'),
            //     'publish_posts',
            //     $this->menu_slug.'#roadmap'
            // );

            add_submenu_page(
                GETGENIE_TEXTDOMAIN,
                esc_html__("Help | Get Genie", 'getgenie'),
                esc_html__("Help", 'getgenie'),
                'publish_posts',
                $this->menu_slug.'#help' 
            ); 

            $this->removeFirstSubMenu();
        });
    }

    /**
     *remove first sub-menu
     */
    public function removeFirstSubMenu()
    {
        remove_submenu_page('getgenie', 'getgenie');
    }


    /**
     * set content for Get Genie dashboard
     */
    public function writeForMePageData()
    {

        if ( isset( $_GET['open_modal'] ) && $_GET['open_modal'] == '1' ) {

            $user_id = get_current_user_id();

            //update option after redirection
            update_option( $user_id.'_getgenie_showed_notification', '4.1.0' );
        }

        return genie_view('admin/default');
    }


    /**
     * set content for history menu
     */
    public function historyPageData()
    {
        return genie_view('admin/default');
    }

    /**
     * set content for settings menu
     */
    public function settingsPageData()
    {
        return genie_view('admin/default');
    }

    /**
     * set content for license menu
     */
    public function licensePageData()
    {
        return genie_view('admin/default');
    }

    /**
     * set content for help menu
     */
    public function helpPageData()
    {
        return genie_view('admin/default');
    }

}

