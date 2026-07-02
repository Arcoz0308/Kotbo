<script lang="ts">
  import { tokenizeDiscordMarkdown } from '../../utils/discordMarkdown';

  let { text = '' } = $props<{ text?: string }>();

  const segments = $derived(tokenizeDiscordMarkdown(text ?? ''));
</script>

{#each segments as segment, i (i)}
  {#if segment.type === 'text'}{segment.value}
  {:else if segment.type === 'bold'}<strong>{segment.value}</strong>
  {:else if segment.type === 'italic'}<em>{segment.value}</em>
  {:else if segment.type === 'underline'}<u>{segment.value}</u>
  {:else if segment.type === 'strike'}<del>{segment.value}</del>
  {:else if segment.type === 'code'}<code class="discord-inline-code">{segment.value}</code>
  {:else if segment.type === 'codeblock'}<pre class="discord-block-code"><code>{segment.value}</code></pre>
  {:else if segment.type === 'emoji'}<img src={segment.url} alt={segment.alt} title={segment.alt} class="discord-emoji" />
  {:else if segment.type === 'link'}<a href={segment.url} target="_blank" rel="noopener noreferrer" class="discord-link">{segment.label}</a>
  {/if}
{/each}

<style>
  .discord-inline-code {
    background: #1e1f22;
    padding: 1px 4px;
    border-radius: 4px;
    font-family: Consolas, 'Andale Mono WT', 'Andale Mono', 'Lucida Console', Monaco, monospace;
    font-size: 85%;
  }

  .discord-block-code {
    display: block;
    background: #1e1f22;
    border: 1px solid #2b2d31;
    padding: 8px 10px;
    border-radius: 4px;
    font-family: Consolas, 'Andale Mono WT', 'Andale Mono', 'Lucida Console', Monaco, monospace;
    font-size: 85%;
    overflow-x: auto;
    margin: 6px 0;
    white-space: pre-wrap;
  }

  .discord-emoji {
    width: 20px;
    height: 20px;
    object-fit: contain;
    vertical-align: bottom;
    display: inline-block;
    margin: 0 1px;
  }

  .discord-link {
    color: #00a8fc;
    text-decoration: none;
  }

  .discord-link:hover {
    text-decoration: underline;
  }
</style>
