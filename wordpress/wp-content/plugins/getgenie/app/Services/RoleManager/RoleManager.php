<?php

namespace GenieAi\App\Services\RoleManager;

class RoleManager
{

    private $role_management_config = [];
    private $current_user = null;

    /**
     * Initialize RoleManager with config and user loading
     *
     * @return void
     */
    public function __construct() {

        $this->role_management_config = get_option('genie_role_management_config', []);
        
        // If config is not set, set default permissions for all roles with publish_posts capability
        if (empty($this->role_management_config)) {
            $default_roles = $this->get_roles_with_publish_posts();
            $this->role_management_config = [
                'access_seo_insights' => $default_roles,
                'access_ai_writing' => $default_roles,
                'access_keyword_research' => $default_roles,
            ];
            
            // Save the default config to WordPress options
            update_option('genie_role_management_config', $this->role_management_config);
        }
        
        add_action('init', [$this, 'load_current_user']);
    }

    /**
     * Get all roles that have publish_posts capability
     *
     * @return array Array of role slugs with publish_posts capability
     */
    private function get_roles_with_publish_posts() {
        $roles = [];
        $all_roles = \wp_roles()->get_names();
        
        foreach ($all_roles as $role => $label) {
            $role_obj = \wp_roles()->get_role($role);
            if ($role_obj && !empty($role_obj->capabilities['publish_posts'])) {
                $roles[] = $role;
            }
        }
        
        return $roles;
    }

    /**
     * Load current user on init hook
     *
     * This method is called on the WordPress 'init' hook to load and store the
     * current logged-in user for role-based permission checks.
     *
     * @return void
     */
    public function load_current_user() {
        $this->current_user = wp_get_current_user();
    }
    
    /**
     * Check if current user is allowed to access SEO Insights
     *
     * @return bool
     */
    public function is_allow_seo_insights() {
        if (!$this->current_user->ID) {
            return false;
        }

        if (!isset($this->role_management_config['access_seo_insights'])) {
            return false;
        }

        $allowed_roles = $this->role_management_config['access_seo_insights'];
        return $this->user_has_role($this->current_user, $allowed_roles);
    }

    /**
     * Check if current user is allowed to access Keyword Research
     *
     * @return bool
     */
    public function is_allow_keyword_research() {
        if (!$this->current_user->ID) {
            return false;
        }

        if (!isset($this->role_management_config['access_keyword_research'])) {
            return false;
        }

        $allowed_roles = $this->role_management_config['access_keyword_research'];
        return $this->user_has_role($this->current_user, $allowed_roles);
    }

    /**
     * Check if current user is allowed to access AI Writing (Chatbot)
     *
     * @return bool
     */
    public function is_allow_ai_writing() {
        if (!$this->current_user->ID) {
            return false;
        }

        if (!isset($this->role_management_config['access_ai_writing'])) {
            return false;
        }

        $allowed_roles = $this->role_management_config['access_ai_writing'];
        return $this->user_has_role($this->current_user, $allowed_roles);
    }

    /**
     * Check if user has any of the allowed roles
     *
     * @param \WP_User $user
     * @param array $allowed_roles
     * @return bool
     */
    private function user_has_role($user, $allowed_roles) {
        if (empty($allowed_roles)) {
            return false;
        }

        $user_roles = (array) $user->roles;
        return !empty(array_intersect($user_roles, $allowed_roles));
    }
}