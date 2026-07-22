<?php

namespace EmailKit\Admin;

defined( 'ABSPATH' ) || exit;

class AssetConflictManager
{

    // Add conflicted scripts handle
    protected $dequeue_scripts = [
        'wp_social_select2_js',
    ];
    // Add conflicted scripts handle and enque new scripts
   

    public function __construct()
    {
       add_action('before_emailkit_asset_load', [$this, 'dequeue_scripts']);
    }

    public function dequeue_scripts(){

        foreach ($this->dequeue_scripts as $key => $handle) {
            wp_dequeue_script( $handle );
        }
        
    }

  

}
