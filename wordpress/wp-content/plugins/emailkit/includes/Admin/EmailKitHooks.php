<?php 
namespace EmailKit\Admin;

defined("ABSPATH") || exit;

class EmailKitHooks {


    public function __construct()
    {
        
        add_filter('emailkit_shortcode_filter', [$this, 'replace'], 10, 2);
    }

    public function replace($input){

        // Define the regular expression pattern
        $pattern = '/<span data-shortcode="{{([\w]+)}}">([\w]+)<\/span>/';

        // Use preg_match_all to find all matches in the input
        preg_match_all($pattern, $input, $matches, PREG_SET_ORDER);

        // Loop through each match and replace the content inside the span tag
        foreach ($matches as $match) {
            $shortcode = $match[1]; // Content inside the data-shortcode attribute

            // Create the replacement string and replace the match in the input
            $replacement = '<span data-shortcode="{{' . $shortcode . '}}">{{' . strtolower($shortcode) . '}}</span>';
            $input = str_replace($match[0], $replacement, $input);
        }

        return $input;
    }

}
