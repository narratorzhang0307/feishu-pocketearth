import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrLabel } from './sense';

const mocks = vi.hoisted(() => ({
  visionRead: vi.fn(),
  qwenVision: vi.fn(),
}));

vi.mock('../skills/visionRead', () => ({
  visionRead: mocks.visionRead,
}));

vi.mock('../skills/qwenVision', () => ({
  qwenVision: mocks.qwenVision,
}));

describe('ocrLabel · 图片识别兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('端侧 OCR 抛错时返回空文本，不阻断手填兜底', async () => {
    mocks.visionRead.mockRejectedValueOnce(new Error('edge unavailable'));

    await expect(ocrLabel('data:image/png;base64,xxx')).resolves.toEqual({
      text: '',
      engine: 'manual',
    });
    expect(mocks.qwenVision).not.toHaveBeenCalled();
  });

  it('端侧 OCR 只有空白时视为无文本，并标记手填兜底', async () => {
    mocks.visionRead.mockResolvedValueOnce(' \n \t ');

    await expect(ocrLabel('data:image/png;base64,xxx')).resolves.toEqual({
      text: '',
      engine: 'manual',
    });
    expect(mocks.qwenVision).not.toHaveBeenCalled();
  });

  it('端侧读不出且允许云端时，云端文本可作为兜底', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('Winged Victory of Samothrace');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 Markdown 代码块和识别结果前缀', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('```text\n识别结果：\nWinged Victory of Samothrace\nMarble, Hellenistic period\n```');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 JSON 字符串包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('{"text":"Winged Victory of Samothrace\\nMarble, Hellenistic period"}');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 output_text 字符串包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('{"output_text":"Winged Victory of Samothrace\\nMarble, Hellenistic period"}');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的结构化展品字段包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      title: 'Winged Victory of Samothrace',
      period: 'Hellenistic period',
      materials: 'Parian marble',
      repository: 'Louvre',
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nHellenistic period\nParian marble\nLouvre',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的展签对象包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      museumLabel: {
        object: 'Winged Victory of Samothrace',
        period: 'Hellenistic period',
        material: 'Parian marble',
        repository: 'Louvre',
      },
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nHellenistic period\nParian marble\nLouvre',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 choices.message.content 包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Here is the extracted text:\nWinged Victory of Samothrace\nMarble, Hellenistic period',
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 前缀后的 JSON 正文包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('Here is the extracted text:\n{"text":"Winged Victory of Samothrace\\nMarble, Hellenistic period"}');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的中文说明前缀和 fenced JSON', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('识别结果如下：\n```json\n{"text":"Winged Victory of Samothrace\\nMarble, Hellenistic period"}\n```');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的图片文字说明前缀', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('The text in the image is:\nWinged Victory of Samothrace\nMarble, Hellenistic period');

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });

    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce('图片文字：\n萨莫色雷斯胜利女神像\n大理石');

    await expect(ocrLabel('data:image/png;base64,yyy', true)).resolves.toEqual({
      text: '萨莫色雷斯胜利女神像\n大理石',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 content block 数组包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: '识别结果：\nWinged Victory of Samothrace\nMarble, Hellenistic period',
              },
            ],
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('清理 Qwen 云端 OCR 的 candidates.content.parts 包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '识别结果：\nWinged Victory of Samothrace\nMarble, Hellenistic period',
              },
            ],
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('优先解包 Qwen 云端 OCR 工具调用参数里的展签文本', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'extract_museum_label_text',
                  args: {
                    text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
                  },
                },
              },
            ],
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('解包 Qwen 云端 OCR 的 Google Vision fullTextAnnotation 包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      responses: [
        {
          fullTextAnnotation: {
            text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('优先解包 Qwen 云端 OCR textAnnotations 首项完整展签文本', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      textAnnotations: [
        {
          description: '萨莫色雷斯胜利女神像\n希腊化时代\n大理石\n卢浮宫',
        },
        { description: '萨莫色雷斯' },
        { description: '胜利女神像' },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: '萨莫色雷斯胜利女神像\n希腊化时代\n大理石\n卢浮宫',
      engine: 'qwen-vision',
    });
  });

  it('解包 Qwen 云端 OCR 的 tool_calls.function.arguments 包装', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'extract_museum_label_text',
                  arguments: '{"text":"Winged Victory of Samothrace\\nMarble, Hellenistic period"}',
                },
              },
            ],
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: 'Winged Victory of Samothrace\nMarble, Hellenistic period',
      engine: 'qwen-vision',
    });
  });

  it('解包 Qwen 云端 OCR 工具调用参数里的展签专名字段', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockResolvedValueOnce(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'extract_museum_label_text',
                  args: {
                    label_text: '萨莫色雷斯胜利女神像\n希腊化时代\n大理石\n卢浮宫',
                  },
                },
              },
            ],
          },
        },
      ],
    }));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: '萨莫色雷斯胜利女神像\n希腊化时代\n大理石\n卢浮宫',
      engine: 'qwen-vision',
    });
  });

  it('云端 OCR 抛错时仍返回空文本', async () => {
    mocks.visionRead.mockResolvedValueOnce('');
    mocks.qwenVision.mockRejectedValueOnce(new Error('no gmi key'));

    await expect(ocrLabel('data:image/png;base64,xxx', true)).resolves.toEqual({
      text: '',
      engine: 'manual',
    });
  });
});
