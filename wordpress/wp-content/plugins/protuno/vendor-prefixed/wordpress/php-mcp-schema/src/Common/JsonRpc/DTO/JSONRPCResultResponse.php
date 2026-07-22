<?php

declare(strict_types=1);

namespace Protuno\Deps\WP\McpSchema\Common\JsonRpc\DTO;

use Protuno\Deps\WP\McpSchema\Common\AbstractDataTransferObject;
use Protuno\Deps\WP\McpSchema\Common\JsonRpc\Union\JSONRPCResponseInterface;
use Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result;
use Protuno\Deps\WP\McpSchema\Common\Traits\ValidatesRequiredFields;

/**
 * A successful (non-error) response to a request.
 *
 * @since 2025-11-25
 *
 * @mcp-domain Common
 * @mcp-subdomain JsonRpc
 * @mcp-version 2025-11-25
 */
class JSONRPCResultResponse extends AbstractDataTransferObject implements JSONRPCResponseInterface
{
    use ValidatesRequiredFields;

    /**
     * @since 2025-11-25
     *
     * @var '2.0'
     */
    protected string $jsonrpc;

    /**
     * @since 2025-11-25
     *
     * @var string|number
     */
    protected $id;

    /**
     * @since 2025-11-25
     *
     * @var \Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result
     */
    protected Result $result;

    /**
     * @param '2.0' $jsonrpc @since 2025-11-25
     * @param string|number $id @since 2025-11-25
     * @param \Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result $result @since 2025-11-25
     */
    public function __construct(
        string $jsonrpc,
        $id,
        Result $result
    ) {
        $this->jsonrpc = $jsonrpc;
        $this->id = $id;
        $this->result = $result;
    }

    /**
     * Creates an instance from an array.
     *
     * @param array{
     *     jsonrpc: '2.0',
     *     id: string|number,
     *     result: array<string, mixed>|\Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result
     * } $data
     * @phpstan-param array<string, mixed> $data
     * @return self
     */
    public static function fromArray(array $data): self
    {
        self::assertRequired($data, ['jsonrpc', 'id', 'result']);

        /** @var '2.0' $jsonrpc */
        $jsonrpc = self::asString($data['jsonrpc']);

        /** @var string|number $id */
        $id = self::asStringOrNumber($data['id']);

        /** @var \Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result $result */
        $result = is_array($data['result'])
            ? Result::fromArray(self::asArray($data['result']))
            : $data['result'];

        return new self(
            $jsonrpc,
            $id,
            $result
        );
    }

    /**
     * Converts the instance to an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $result = [];

        $result['jsonrpc'] = $this->jsonrpc;
        $result['id'] = $this->id;
        $result['result'] = $this->result->toArray();

        return $result;
    }

    /**
     * @return '2.0'
     */
    public function getJsonrpc(): string
    {
        return $this->jsonrpc;
    }

    /**
     * @return string|number
     */
    public function getId()
    {
        return $this->id;
    }

    /**
     * @return \Protuno\Deps\WP\McpSchema\Common\Protocol\DTO\Result
     */
    public function getResult(): Result
    {
        return $this->result;
    }
}
