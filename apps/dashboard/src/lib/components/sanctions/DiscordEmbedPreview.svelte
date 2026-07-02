<script lang="ts">
  import DiscordMarkdownText from './DiscordMarkdownText.svelte';

  interface ParsedEmbed {
    color: string | null;
    authorName: string | null;
    authorIconUrl: string | null;
    authorUrl: string | null;
    title: string | null;
    url: string | null;
    description: string | null;
    fields: { name: string; value: string; inline: boolean }[];
    thumbnailUrl: string | null;
    imageUrl: string | null;
    footerText: string | null;
    footerIconUrl: string | null;
  }

  let { embed } = $props<{ embed: ParsedEmbed }>();
</script>

<div class="discord-embed" style="border-left-color: {embed.color ?? '#1e1f22'}">
  <div class="discord-embed-body">
    <div class="discord-embed-text">
      {#if embed.authorName}
        <div class="discord-embed-author">
          {#if embed.authorIconUrl}<img src={embed.authorIconUrl} alt="" class="discord-embed-author-icon" />{/if}
          {#if embed.authorUrl}
            <a href={embed.authorUrl} target="_blank" rel="noopener noreferrer" class="discord-embed-author-link">{embed.authorName}</a>
          {:else}
            <span>{embed.authorName}</span>
          {/if}
        </div>
      {/if}

      {#if embed.title}
        <div class="discord-embed-title">
          {#if embed.url}
            <a href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>
          {:else}
            {embed.title}
          {/if}
        </div>
      {/if}

      {#if embed.description}
        <div class="discord-embed-description"><DiscordMarkdownText text={embed.description} /></div>
      {/if}

      {#if embed.fields.length > 0}
        <div class="discord-embed-fields">
          {#each embed.fields as field, i (i)}
            <div class="discord-embed-field {field.inline ? 'inline' : ''}">
              <div class="discord-embed-field-name">{field.name}</div>
              <div class="discord-embed-field-value"><DiscordMarkdownText text={field.value} /></div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if embed.thumbnailUrl}
      <div class="discord-embed-thumbnail-container">
        <img class="discord-embed-thumbnail" src={embed.thumbnailUrl} alt="" />
      </div>
    {/if}
  </div>

  {#if embed.imageUrl}
    <div class="discord-embed-image-container">
      <img class="discord-embed-image" src={embed.imageUrl} alt="" />
    </div>
  {/if}

  {#if embed.footerText}
    <div class="discord-embed-footer">
      {#if embed.footerIconUrl}<img src={embed.footerIconUrl} alt="" class="discord-embed-footer-icon" />{/if}
      <span>{embed.footerText}</span>
    </div>
  {/if}
</div>

<style>
  /* Palette alignée sur apps/bot/src/services/features/transcriptService.ts (thème Discord sombre) */
  .discord-embed {
    background-color: #2b2d31;
    border-left: 4px solid #1e1f22;
    border-radius: 4px;
    padding: 12px 16px;
    margin-top: 8px;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .discord-embed-body {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .discord-embed-text {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .discord-embed-author {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #f2f3f5;
  }

  .discord-embed-author-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }

  .discord-embed-author-link {
    color: #f2f3f5;
    text-decoration: none;
  }

  .discord-embed-author-link:hover {
    text-decoration: underline;
  }

  .discord-embed-title {
    font-size: 15px;
    color: #00a8fc;
    font-weight: 600;
  }

  .discord-embed-title a {
    color: #00a8fc;
    text-decoration: none;
  }

  .discord-embed-title a:hover {
    text-decoration: underline;
  }

  .discord-embed-description {
    font-size: 13px;
    color: #dbdee1;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .discord-embed-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }

  .discord-embed-field {
    flex: 1 1 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .discord-embed-field.inline {
    flex: 1 1 45%;
  }

  .discord-embed-field-name {
    font-size: 11px;
    color: #949ba4;
    font-weight: 600;
  }

  .discord-embed-field-value {
    font-size: 13px;
    color: #dbdee1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .discord-embed-thumbnail-container {
    flex-shrink: 0;
  }

  .discord-embed-thumbnail {
    max-width: 72px;
    max-height: 72px;
    border-radius: 4px;
    object-fit: contain;
  }

  .discord-embed-image-container {
    margin-top: 4px;
    border-radius: 4px;
    overflow: hidden;
  }

  .discord-embed-image {
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
    border-radius: 4px;
  }

  .discord-embed-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 11px;
    color: #949ba4;
  }

  .discord-embed-footer-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }
</style>
