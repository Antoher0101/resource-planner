import { $, createSVG } from './svg_utils';

export default class Dimension {
    constructor(gantt, groups, columns, elheader, elcontent) {
        this.set_defaults(gantt, groups, columns, elheader, elcontent);
        this.rows = [];
        this.valueMerges = [];
        this.make_data();
    }
    /**
     * Устанавливает параметры по умолчанию
     * @param {Object} gantt - Основной объект диаграммы
     * @param {Array} groups - Список задач
     * @param {Array} columns - Описание колонок (field, label)
     * @param {Element} elheader - Контейнер для заголовков колонок
     * @param {Element} elcontent - Контейнер для содержимого колонок frappe-gantt.min.css
     * frappe-gantt.min.js
     */
    set_defaults(gantt, groups, columns, elheader, elcontent) {
        elheader.innerHTML = '';
        elcontent.innerHTML = '';

        this.text_offset_top = 11;
        this.gantt = gantt;
        this.groups = groups;
        this.columns = columns;
        this.$elheader = elheader;
        this.$elcontent = elcontent;
    }

    /**
     * Рендеринг одной колонки (заголовки, данные, линии)
     * @param {number} col - Индекс колонки
     * @param {number} col_x - Текущая ширина колонки
     * @param {Element} parent - Родительский контейнер для линий
     */
    render_col(col, col_x, parent) {
        let column = this.columns[col];
        let mergelen = this.valueMerges[col].length;
        for (let row = 0; row < mergelen; row++) {
            let value = this.valueMerges[col][row];
            if (value.el) {
                // Обновляем координаты линии данных
                value.lineEl.setAttribute('x2', col_x);

                // Проверяем, есть ли объединенные ячейки
                if (
                    this.valueMerges[col][row + 1] &&
                    this.valueMerges[col][row + 1].isMerge == true
                ) {
                    var mergeCount = 1;
                    while (
                        this.valueMerges[col][row + mergeCount] &&
                        this.valueMerges[col][row + mergeCount].isMerge == true
                    ) {
                        mergeCount++;
                    }

                    // Вычисляем позицию текста в объединенной ячейке
                    let textpos =
                        parseFloat(value.el.getAttribute('y')) -
                        this.text_offset_top;
                    textpos += (mergeCount * this.row_height) / 2 - 16 / 2 - 11;
                    value.el.setAttribute('y', textpos);
                    row += mergeCount - 1;
                }
            }
        }

        col++;
        // Рендер вертикальной линии для разделения колонок
        createSVG('line', {
            x1: col_x,
            y1: 0,
            x2: col_x,
            y2: this.grid_height,
            class: 'header-row-line',
            append_to: parent,
        });

        // Линия в заголовке
        createSVG('line', {
            x1: col_x,
            y1: 0,
            x2: col_x,
            y2: 72,
            class: 'header-row-line',
            append_to: this.$elheader,
        });
    }

    /**
     * Генерация данных и их рендеринг
     */
    make_data() {
        // Создаем слой содержимого
        const layer = createSVG('g', {
            class: 'content',
            append_to: this.$elcontent,
        });

        // Создаем слой линий
        const lines_layer = createSVG('g', { append_to: this.$elcontent });
        this.grid_height =
            (this.gantt.options.bar_height + this.gantt.options.padding) *
                this.groups.length +
            20;

        this.row_height =
            this.gantt.options.bar_height + this.gantt.options.padding;
        this.$elcontent.setAttribute('height', this.grid_height);
        this.$elcontent.setAttribute('width', 1200);
        const row_width = this.columns.length * 250;
        let col_x = 0;
        var col = 0;
        for (let column of this.columns) {
            let row_y = 0;
            let maxwidth = 40;
            let lasttext = null;

            // Инициализация объединения значений
            this.valueMerges.push([]);
            let rect = createSVG('rect', {
                x: col_x,
                y: row_y,
                width: row_width,
                height: this.grid_height,
                class: 'data-col',
                append_to: layer,
            });
            var row = 0;
            for (let g of this.groups) {
                var text = '';
                if (g[column.property]) {
                    text = g[column.property];
                }

                // Проверяем, является ли ячейка объединенной
                let Merge = col === 0 ? null : this.valueMerges[col - 1][row];
                let cell = this.make_cell(
                    layer,
                    text,
                    lasttext,
                    col_x,
                    row_y,
                    Merge ? Merge.isMerge : null,
                );
                if (cell) {
                    let box = cell.getBBox();
                    maxwidth = Math.min(Math.max(maxwidth, box.width), 250);
                    // Добавляем данные о ячейке
                    this.valueMerges[col].push({
                        el: cell,
                        lineEl: createSVG('line', {
                            x1: col_x,
                            y1: row_y,
                            x2: col_x + maxwidth,
                            y2: row_y,
                            class: 'header-row-line',
                            append_to: lines_layer,
                        }),
                        isMerge: false,
                    });
                } else {
                    this.valueMerges[col].push({
                        el: null,
                        isMerge: true,
                    });
                }
                row++;
                lasttext = text;
                row_y += this.row_height;
            }

            // Рендер заголовка
            this.make_cell(
                this.$elheader,
                column.title,
                null,
                col_x,
                18,
                false,
                true,
            );
            col_x += maxwidth + 10;

            // Рендер линии для колонки
            this.render_col(col, col_x, lines_layer);
            rect.setAttribute('width', col_x);
            col++;
        }

        // Нижняя линия
        createSVG('line', {
            x1: 0,
            y1: this.grid_height - 20,
            x2: col_x,
            y2: this.grid_height - 20,
            class: 'header-row-line',
            append_to: lines_layer,
        });

        this.content_width = col_x; // Общая ширина содержимого
    }

    /**
     * Создает ячейку данных
     * @param {Element} layer - Слой, куда добавляется ячейка
     * @param {string} text - Текст ячейки
     * @param {string} lasttext - Текст предыдущей строки
     * @param {number} col_x - Позиция по оси X
     * @param {number} row_y - Позиция по оси Y
     * @param {boolean} merge - Флаг объединения
     * @returns {Element} Созданная ячейка
     */
    make_cell(layer, text, lasttext, col_x, row_y, merge, header = false) {
        if (header) {
            return createSVG('text', {
                x: col_x + 5,
                y: row_y + this.text_offset_top + 12,
                innerHTML: text,
                class: 'content-text',
                append_to: layer,
            });
        }
        if (text !== lasttext || text === '') {
            const textWidth = this.getTextWidth(text);

            const foreignObject = createSVG('foreignObject', {
                x: col_x + 5,
                y: row_y,
                height: this.row_height,
                width: Math.min(textWidth + 10, 240),
                class: 'content-text',
                append_to: layer,
            });
            const div = document.createElement('div');
            div.style.overflow = 'hidden';
            div.style.textOverflow = 'ellipsis';
            div.style.whiteSpace = 'pre-wrap';
            div.textContent = text;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.height = '100%';
            foreignObject.appendChild(div);
            return foreignObject;
        }
        if (merge === false) {
            return createSVG('text', {
                x: col_x + 5,
                y: row_y + this.text_offset_top + 12,
                innerHTML: text,
                class: 'content-text',
                append_to: layer,
            });
        }
    }

    getTextWidth(text) {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.marginLeft = '-99999px';
        div.style.display = 'inline-block';
        div.style.fontSize = '12px';
        div.innerHTML = text;

        document.body.appendChild(div);

        const width = div.offsetWidth;
        document.body.removeChild(div);

        return width;
    }
}
