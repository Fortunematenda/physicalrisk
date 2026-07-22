<?php

echo "<h2>PHP Upload Configuration</h2>";

echo "upload_max_filesize: <strong>" . ini_get('upload_max_filesize') . "</strong><br>";
echo "post_max_size: <strong>" . ini_get('post_max_size') . "</strong><br>";
echo "memory_limit: <strong>" . ini_get('memory_limit') . "</strong><br>";
echo "max_execution_time: <strong>" . ini_get('max_execution_time') . " seconds</strong><br>";
echo "max_input_time: <strong>" . ini_get('max_input_time') . " seconds</strong><br>";

echo "<hr>";

echo "Loaded php.ini: <strong>" . php_ini_loaded_file() . "</strong>";
?>