import date_utils from './date_utils';
import { $, createSVG } from './svg_utils';
import Bar from './bar';
import Arrow from './arrow';
import Popup from './popup';

import './gantt.scss';
import Group from './group.js';
import Range from './utils/range.js';
import Dimension from './dimension.js';

const VIEW_MODE = {
    QUARTER_DAY: 'Quarter Day',
    HALF_DAY: 'Half Day',
    DAY: 'Day',
    WEEK: 'Week',
    MONTH: 'Month',
    YEAR: 'Year',
};

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.setup_options(options);
        this.setup_wrapper(wrapper);
        this.setup_tasks(tasks);
        this.fill_vertical_space();
        this.setup_dimension();
        // initialize with default view mode
        this.change_view_mode();
        this.bind_events();
    }

    setup_wrapper(element) {
        let svg_element, wrapper_element;

        // CSS Selector is passed
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        // get the SVGElement
        if (element instanceof HTMLElement) {
            wrapper_element = element;
            svg_element = element.querySelector('svg');
        } else if (element instanceof SVGElement) {
            svg_element = element;
        } else {
            throw new TypeError(
                'Frappé Gantt only supports usage of a string CSS selector,' +
                    " HTML DOM element or SVG DOM element for the 'element' parameter",
            );
        }

        // svg element
        if (!svg_element) {
            // create it
            this.$svg = createSVG('svg', {
                append_to: wrapper_element,
                class: 'gantt',
                id: 'gantt_svg',
            });
        } else {
            this.$svg = svg_element;
            this.$svg.classList.add('gantt');
        }

        // wrapper element
        this.$container = document.createElement('div');
        this.$container.classList.add('gantt-container');

        this.$taskinfo = document.createElement('div');
        this.$taskinfo.classList.add('task-info-wrapper');
        this.$container.appendChild(this.$taskinfo);

        this.$taskinfo_header = document.createElement('div');
        this.$taskinfo_header.classList.add('task-info-header-wrapper');
        this.$taskinfo_header.style.height = `${this.options.header_height}px`;

        this.$taskinfo.appendChild(this.$taskinfo_header);
        this.$svg_data_header = createSVG('svg', {
            append_to: this.$taskinfo_header,
            class: 'gantt',
        });
        this.$svg_data_header.style.width = '100%';

        this.$taskinfo_content = document.createElement('div');
        this.$taskinfo_content.classList.add('task-info-content-wrapper');
        this.$taskinfo_content.style.top = `${this.options.header_height + 1}px`;

        this.$taskinfo.appendChild(this.$taskinfo_content);
        this.$svg_data_content = createSVG('svg', {
            append_to: this.$taskinfo_content,
            class: 'gantt',
        });

        this.$task = document.createElement('div');
        this.$task.classList.add('task-wrapper');
        this.$container.appendChild(this.$task);
        this.$task_header = document.createElement('div');
        this.$task_header.classList.add('task-header-wrapper');
        this.$task_header.style.height = `${this.options.header_height}px`;

        this.$svg_header = createSVG('svg', {
            append_to: this.$task_header,
            class: 'gantt',
        });

        this.$task.appendChild(this.$task_header);
        this.$task_content = document.createElement('div');
        this.$task_content.classList.add('task-content-wrapper');
        this.$task_content.style.top = `${this.options.header_height + 1}px`;

        this.$task.appendChild(this.$task_content);

        const parent_element = this.$svg.parentElement;
        parent_element.appendChild(this.$container);
        this.$task_content.appendChild(this.$svg);

        // popup wrapper
        this.popup_wrapper = document.createElement('div');
        this.popup_wrapper.classList.add('popup-wrapper');
        this.$container.appendChild(this.popup_wrapper);
    }

    setup_options(options) {
        const default_options = {
            columns: [],
            header_height: 50,
            column_width: 38,
            details_column_width: 200,
            step: 24,
            view_modes: [...Object.values(VIEW_MODE)],
            bar_height: 30,
            bar_corner_radius: 3,
            arrow_curve: 5,
            padding: 18,
            view_mode: 'Day',
            readonly: false,
            date_format: 'YYYY-MM-DD',
            popup_trigger: 'click',
            custom_popup_html: null,
            lines: 'both',
            language: 'en',
            highlight_weekend: true,
            progress_enable: false,
            alternate_row_color: true,
            enable_grouping: false,
            add_empty_row: false,
        };
        this.options = Object.assign({}, default_options, options);
    }

    setup_tasks(tasks) {
        const groupMap = new Map();
        let currentGroupIndex = 0;

        // prepare tasks
        this.tasks = tasks.map((task, i) => {
            task._isPlaceholder = false;

            // convert to Date objects
            task._start = date_utils.parse(task.start);
            if (task.end === undefined && task.duration !== undefined) {
                task.end = task._start;
                let durations = task.duration.split(' ');

                durations.forEach((tmpDuration) => {
                    let { duration, scale } =
                        date_utils.parse_duration(tmpDuration);
                    task.end = date_utils.add(task.end, duration, scale);
                });
            }
            task._end = date_utils.parse(task.end);
            let diff = date_utils.diff(task._end, task._start, 'year');
            if (diff < 0) {
                throw Error(
                    "start of task can't be after end of task: in task #, " +
                        (i + 1),
                );
            }
            // make task invalid if duration too large
            if (date_utils.diff(task._end, task._start, 'year') > 10) {
                task.end = null;
            }

            // uids
            if (!task.id) {
                task.id = generate_id(task);
            } else if (typeof task.id === 'string') {
                task.id = task.id.replaceAll(' ', '_');
            } else {
                task.id = `${task.id}`;
            }
            let groupTitle;
            let groupId;
            if (this.options.enable_grouping) {
                groupTitle = task.group?.name || task.title;
                groupId = task.group?.id || task.id;
            } else {
                groupTitle = task.title;
                groupId = generate_id(task);
            }
            let group;

            if (groupTitle && groupMap.has(groupId)) {
                group = groupMap.get(groupId);
            } else {
                group = new Group(
                    groupTitle,
                    currentGroupIndex,
                    false,
                    task.group || {},
                );
                Object.assign(group, task.attributes);
                groupMap.set(groupId, group);
                currentGroupIndex++;
            }
            if (groupId) {
                group.id = groupId;
            }

            group.addTask(task);
            // cache index
            task._index = group._index;

            // invalid dates
            if (!task.start && !task.end) {
                const today = date_utils.today();
                task._start = today;
                task._end = date_utils.add(today, 2, 'day');
            }

            if (!task.start && task.end) {
                task._start = date_utils.add(task._end, -2, 'day');
            }

            if (task.start && !task.end) {
                task._end = date_utils.add(task._start, 2, 'day');
            }

            // if hours is not set, assume the last day is full day
            // e.g: 2018-09-09 becomes 2018-09-09 23:59:59
            const task_end_values = date_utils.get_date_values(task._end);
            if (task_end_values.slice(3).every((d) => d === 0)) {
                task._end = date_utils.add(task._end, 24, 'hour');
            }

            // invalid flag
            if (!task.start || !task.end) {
                task.invalid = true;
            }

            // dependencies
            if (typeof task.dependencies === 'string' || !task.dependencies) {
                let deps = [];
                if (task.dependencies) {
                    deps = task.dependencies
                        .split(',')
                        .map((d) => d.trim().replaceAll(' ', '_'))
                        .filter((d) => d);
                }
                task.dependencies = deps;
            }

            return task;
        });

        this.groups = Array.from(groupMap.values());
        this.setup_dependencies();
    }

    setup_dimension() {
        if (!this.options.columns || this.options.columns.length === 0) {
            this.$taskinfo.style.width = '0px';
            return;
        }
        let dimension = new Dimension(
            this,
            this.groups,
            this.options.columns,
            this.$svg_data_header,
            this.$svg_data_content,
        );
        this.$taskinfo.style.width = dimension.content_width + 'px';
        this.$task.style.left = dimension.content_width + 1 + 'px';
        this.$task.style.width =
            'calc( 100% - ' + dimension.content_width + 'px )';
    }

    setup_dependencies() {
        this.dependency_map = {};
        for (let t of this.tasks) {
            for (let d of t.dependencies) {
                this.dependency_map[d] = this.dependency_map[d] || [];
                this.dependency_map[d].push(t.id);
            }
        }
    }

    refresh(tasks) {
        this.setup_tasks(tasks);
        this.change_view_mode();
    }

    refresh_tasks(tasks) {
        this.setup_tasks(tasks);
        this.fill_vertical_space();
        this.setup_dimension();
        this.setup_dates();
        this.render();
    }

    change_view_mode(mode = this.options.view_mode) {
        this.update_view_scale(mode);
        this.setup_dates();
        this.render();
        // fire viewmode_change event
        this.trigger_event('view_change', [mode]);
    }

    update_view_scale(view_mode) {
        this.options.view_mode = view_mode;

        if (view_mode === VIEW_MODE.DAY) {
            this.options.step = 24;
            this.options.column_width = 38;
        } else if (view_mode === VIEW_MODE.HALF_DAY) {
            this.options.step = 24 / 2;
            this.options.column_width = 38;
        } else if (view_mode === VIEW_MODE.QUARTER_DAY) {
            this.options.step = 24 / 4;
            this.options.column_width = 38;
        } else if (view_mode === VIEW_MODE.WEEK) {
            this.options.step = 24 * 7;
            this.options.column_width = 38 * 2;
        } else if (view_mode === VIEW_MODE.MONTH) {
            this.options.step = 24 * 30;
            this.options.column_width = 120;
        } else if (view_mode === VIEW_MODE.YEAR) {
            this.options.step = 24 * 365;
            this.options.column_width = 120;
        }
    }

    setup_dates() {
        this.setup_gantt_dates();
        this.setup_date_values();
    }

    setup_gantt_dates() {
        this.gantt_start = this.gantt_end = null;

        for (let task of this.tasks) {
            // set global start and end date
            if (!this.gantt_start || task._start < this.gantt_start) {
                this.gantt_start = task._start;
            }
            if (!this.gantt_end || task._end > this.gantt_end) {
                this.gantt_end = task._end;
            }
        }

        if (this.gantt_start === null || this.gantt_end === null) {
            this.gantt_start = new Date();
            this.gantt_end = new Date();
        }

        this.gantt_start = date_utils.start_of(this.gantt_start, 'day');
        this.gantt_end = date_utils.start_of(this.gantt_end, 'day');

        let taskWidth = this.$task.offsetWidth;
        // add date padding on both sides
        if (this.view_is([VIEW_MODE.QUARTER_DAY, VIEW_MODE.HALF_DAY])) {
            this.gantt_start = date_utils.add(this.gantt_start, -7, 'day');
            this.gantt_end = date_utils.add(this.gantt_end, 7, 'day');
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            this.gantt_start = date_utils.start_of(this.gantt_start, 'year');
            this.gantt_end = date_utils.add(this.gantt_end, 1, 'year');
            this.gantt_end.setMonth(10);
            this.gantt_end.setDate(30);
        } else if (this.view_is(VIEW_MODE.YEAR)) {
            this.gantt_start = date_utils.add(this.gantt_start, -2, 'year');
            this.gantt_start.setMonth(0);
            this.gantt_start.setDate(1);
            var lastend = taskWidth / 120 / 2;
            if (lastend > 5) {
                lastend = lastend - 3;
            }
            this.gantt_end = date_utils.add(this.gantt_end, lastend, 'year');
            this.gantt_end.setMonth(5);
            this.gantt_end.setDate(31);
        } else {
            this.gantt_start = date_utils.add(this.gantt_start, -1, 'month');
            this.gantt_end = date_utils.add(this.gantt_end, 1, 'month');
        }
    }

    setup_date_values() {
        this.dates = [];
        let cur_date = null;

        while (cur_date === null || cur_date < this.gantt_end) {
            if (!cur_date) {
                cur_date = date_utils.clone(this.gantt_start);
            } else {
                if (this.view_is(VIEW_MODE.YEAR)) {
                    cur_date = date_utils.add(cur_date, 1, 'year');
                } else if (this.view_is(VIEW_MODE.MONTH)) {
                    cur_date = date_utils.add(cur_date, 1, 'month');
                } else {
                    cur_date = date_utils.add(
                        cur_date,
                        this.options.step,
                        'hour',
                    );
                }
            }
            this.dates.push(cur_date);
        }
    }

    fill_vertical_space() {
        const containerHeight = this.$svg.parentElement.offsetHeight;
        const rowHeight = this.options.bar_height + this.options.padding;
        const requiredTaskCount = Math.ceil(containerHeight / rowHeight) - 1;

        if (
            this.options.add_empty_row &&
            !this.groups.some((group) => group.isPlaceholder)
        ) {
            const newGroup = new Group('', this.groups.length, true);
            newGroup.createPlaceholder();
            this.groups.push(newGroup);
        }

        while (this.groups.length < requiredTaskCount) {
            const newGroup = new Group('', this.groups.length, true);
            newGroup.createPlaceholder();
            this.groups.push(newGroup);
        }
    }

    bind_events() {
        $.on(this.$task_content, 'scroll', (e) => {
            this.$svg_header.setAttribute(
                'transform',
                'translate(' + (0 - $(e.srcElement).scrollLeft) + ',0)',
            );
            this.$svg_data_content.setAttribute(
                'transform',
                'translate(0,' + (0 - $(e.srcElement).scrollTop) + ')',
            );
        });
        if (this.options.readonly) return;
        this.bind_grid_click();
        this.bind_bar_events();
        this.bind_context_menu();
    }

    render() {
        this.clear();

        this.setup_layers();
        this.make_grid();
        this.make_dates();
        this.make_bars();
        this.make_arrows();
        this.map_arrows_on_bars();
        this.set_width();
        this.set_scroll_position();
    }

    setup_layers() {
        this.layers = {};
        const layers = ['grid', 'arrow', 'progress', 'bar', 'details'];
        for (let layer of layers) {
            this.layers[layer] = createSVG('g', {
                class: layer,
                append_to: this.$svg,
            });
        }

        this.layers['date'] = createSVG('g', {
            class: 'date',
            append_to: this.$svg_header,
        });
    }

    make_grid() {
        this.make_grid_background();
        this.make_grid_rows();
        this.make_grid_ticks();
        this.make_grid_highlights();
    }

    make_grid_background() {
        const grid_width = this.dates.length * this.options.column_width;
        const grid_height =
            (this.options.bar_height + this.options.padding) *
            this.groups.length;

        createSVG('rect', {
            x: 0,
            y: 0,
            width: grid_width,
            height: grid_height,
            class: 'grid-background',
            append_to: this.layers.grid,
        });

        $.attr(this.$svg, {
            height: grid_height,
            width: '100%',
        });
    }

    make_grid_rows() {
        const rows_layer = createSVG('g', { append_to: this.layers.grid });
        const lines_layer = createSVG('g', { append_to: this.layers.grid });

        const row_width = this.dates.length * this.options.column_width;
        const row_height = this.options.bar_height + this.options.padding;

        let row_y = 0;
        const alt_classname = this.options.alternate_row_color
            ? ' alt-row'
            : '';
        for (let _ of this.groups) {
            createSVG('rect', {
                x: 0,
                y: row_y,
                width: row_width,
                height: row_height,
                class: 'grid-row' + alt_classname,
                append_to: rows_layer,
            });

            createSVG('line', {
                x1: 0,
                y1: row_y + row_height,
                x2: row_width,
                y2: row_y + row_height,
                class: 'row-line',
                append_to: lines_layer,
            });

            row_y += this.options.bar_height + this.options.padding;
        }
        createSVG('line', {
            x1: 0,
            y1: row_y,
            x2: row_width,
            y2: row_y,
            class: 'row-line',
            append_to: lines_layer,
        });
    }

    make_grid_ticks() {
        let tick_x = 0;
        let tick_y = 0; //this.options.padding / 2;
        let tick_height =
            (this.options.bar_height + this.options.padding) *
            this.tasks.length;

        for (let date of this.dates) {
            let tick_class = 'tick';
            // thick tick for monday
            if (this.view_is(VIEW_MODE.DAY) && date.getDate() === 1) {
                tick_class += ' thick';
            }
            // thick tick for first week
            if (
                this.view_is(VIEW_MODE.WEEK) &&
                date.getDate() >= 1 &&
                date.getDate() < 8
            ) {
                tick_class += ' thick';
            }
            // thick ticks for quarters
            if (
                this.view_is(VIEW_MODE.MONTH) &&
                (date.getMonth() + 1) % 3 === 0
            ) {
                tick_class += ' thick';
            }

            createSVG('path', {
                d: `M ${tick_x} ${tick_y} v ${tick_height}`,
                class: tick_class,
                append_to: this.layers.grid,
            });

            tick_x += this.options.column_width;
        }
    }

    make_grid_highlights() {
        // highlight today's date
        if (this.view_is(VIEW_MODE.DAY)) {
            const x =
                (date_utils.diff(date_utils.today(), this.gantt_start, 'hour') /
                    this.options.step) *
                this.options.column_width;
            const y = 0;

            const width = this.options.column_width;
            const height =
                (this.options.bar_height + this.options.padding) *
                this.groups.length;

            createSVG('rect', {
                x,
                y,
                width,
                height,
                class: 'today-highlight',
                append_to: this.layers.grid,
            });
        }
    }

    make_dates() {
        for (let date of this.get_dates_to_draw()) {
            const dayOfWeek = date.dayOfWeek; // 0 = Sunday, 6 = Saturday
            const isHoliday =
                this.options.highlight_weekend &&
                this.view_is(['Day', 'Half Day']) &&
                (dayOfWeek === 0 || dayOfWeek === 6);

            if (isHoliday) {
                createSVG('rect', {
                    x: date.lower_x - date.lower_padding,
                    y: this.options.header_height / 2,
                    width:
                        (this.view_is('Day') ? 1 : 2) *
                        this.options.column_width,
                    height: this.options.header_height,
                    class: 'holiday-highlight',
                    append_to: this.layers.date,
                });
            }
            // Рендер нижнего текста (lower_text)
            createSVG('text', {
                x: date.lower_x,
                y: date.lower_y,
                innerHTML: date.lower_text,
                class: 'lower-text' + (isHoliday ? ' holiday-text' : ''),
                append_to: this.layers.date,
            });

            // Вертикальная линия для lower_text
            createSVG('line', {
                x1: date.lower_x + (date.lower_padding || 0),
                y1: this.options.header_height / 2,
                x2: date.lower_x + (date.lower_padding || 0),
                y2: this.options.header_height,
                class: 'row-line',
                append_to: this.layers.date,
            });

            if (date.upper_text) {
                let offsetx = 0; // Смещение для верхнего текста
                let textoffsetx = 0;

                // Учет смещений для верхнего текста в зависимости от режима
                if (this.view_is(VIEW_MODE.DAY)) {
                    if (date.lower_text !== '1') {
                        date.upper_x -=
                            parseInt(date.lower_text) *
                            this.options.column_width;
                    }
                    switch (date.month) {
                        case 1:
                        case 2: {
                            var day = date_utils.get_days_in_month(
                                new Date(...[date.year, date.month, date.day]),
                            );
                            if (day == 28) {
                                offsetx = 0 - this.options.column_width * 2;
                            } else {
                                offsetx = 0 - this.options.column_width;
                            }
                            break;
                        }
                        case 3:
                        case 5:
                        case 7:
                        case 8:
                        case 10:
                        case 12:
                            offsetx = this.options.column_width;
                            break;
                    }
                }

                // Рендер верхнего текста (upper_text)
                const $upper_text = createSVG('text', {
                    x: date.upper_x + textoffsetx,
                    y: date.upper_y,
                    innerHTML: date.upper_text,
                    class: 'upper-text',
                    append_to: this.layers.date,
                });

                // Вертикальная линия для upper_text
                if (!this.view_is('Week')) {
                    createSVG('line', {
                        x1: date.upper_x + (date.upper_padding || 0) + offsetx,
                        y1: 0,
                        x2: date.upper_x + (date.upper_padding || 0) + offsetx,
                        y2: this.options.header_height / 2,
                        class: 'header-row-line',
                        append_to: this.layers.date,
                    });
                }
                // Удаление текста, выходящего за пределы видимой области
                if (date.upper_x > this.layers.grid.getBBox().width) {
                    $upper_text.remove();
                }
            }
        }
        createSVG('line', {
            x1: 0,
            y1: this.options.header_height / 2,
            x2: (this.dates.length + 1) * this.options.column_width,
            y2: this.options.header_height / 2,
            class: 'header-row-line',
            append_to: this.layers.date,
        });

        createSVG('line', {
            x1: 0,
            y1: this.options.header_height,
            x2: (this.dates.length + 1) * this.options.column_width,
            y2: this.options.header_height,
            class: 'row-line',
            append_to: this.layers.date,
        });
    }

    get_dates_to_draw() {
        let last_date = null;
        const dates = this.dates.map((date, i) => {
            const d = this.get_date_info(date, last_date, i);
            last_date = date;
            return d;
        });
        return dates;
    }

    get_date_info(date, last_date, i) {
        if (!last_date) {
            switch (this.options.view_mode) {
                case 'Year':
                case 'Month': {
                    last_date = date_utils.add(date, 1, 'year');
                    break;
                }
                case 'Week': {
                    last_date = date_utils.add(date, 7, 'month');
                    break;
                }
                case 'Day': {
                    last_date = date_utils.add(date, 1, 'month');
                    break;
                }
                case 'Half Day': {
                    last_date = date_utils.add(date, 1, 'day');
                    break;
                }
                case 'Hour': {
                    last_date = date_utils.add(date, 1, 'day');
                    break;
                }
                default: {
                    last_date = date_utils.add(date, 1, 'year');
                }
            }
        }
        const date_text = {
            Hour_lower: date_utils.format(date, 'HH', this.options.language),
            'Quarter Day_lower': date_utils.format(
                date,
                'HH:00',
                this.options.language,
            ),
            'Half Day_lower': date_utils.format(
                date,
                'HH',
                this.options.language,
            ),
            Day_lower:
                date.getDate() !== last_date.getDate() ||
                date.getMonth() !== last_date.getMonth() ||
                date.getFullYear() !== last_date.getFullYear()
                    ? date_utils.format(date, 'D', this.options.language)
                    : '',
            Week_lower:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(date, 'D MMM', this.options.language)
                    : date_utils.format(date, 'D', this.options.language),
            Month_lower: date_utils.format(date, 'MMMM', this.options.language),
            Year_lower:
                this.options.view_mode === 'Year' && !this.options.upper_text
                    ? date_utils.format(date, 'YYYY', this.options.language)
                    : '',
            'Quarter Day_upper':
                date.getDate() !== last_date.getDate()
                    ? date_utils.format(date, 'D MMM', this.options.language)
                    : '',
            'Half Day_upper':
                date.getDate() !== last_date.getDate()
                    ? date.getMonth() !== last_date.getMonth()
                        ? date_utils.format(
                              date,
                              'D MMM',
                              this.options.language,
                          )
                        : date_utils.format(date, 'D', this.options.language)
                    : '',
            Day_upper:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(date, 'MMMM', this.options.language)
                    : '',
            Week_upper:
                date.getMonth() !== last_date.getMonth()
                    ? date_utils.format(date, 'MMMM', this.options.language)
                    : '',
            Month_upper:
                date.getFullYear() !== last_date.getFullYear()
                    ? date_utils.format(date, 'YYYY', this.options.language)
                    : '',
            Year_upper:
                this.options.view_mode === 'Year' && this.options.upper_text
                    ? date_utils.format(date, 'YYYY', this.options.language)
                    : '',
        };

        const base_pos = {
            x: i * this.options.column_width,
            lower_y: (this.options.header_height / 4) * 3 + 4,
            upper_y: this.options.header_height / 4 + 4,
        };

        const x_pos = {
            'Quarter Day_lower': 0,
            'Quarter Day_upper': (this.options.column_width * 4) / 2,
            'Half Day_lower': this.options.column_width / 2,
            'Half Day_upper': (this.options.column_width * 2) / 2,
            Day_lower: this.options.column_width / 2,
            Day_upper: (this.options.column_width * 30) / 2,
            Week_lower: this.options.column_width / 2,
            Week_upper: (this.options.column_width * 7) / 2,
            Month_lower: this.options.column_width / 2,
            Month_upper: (this.options.column_width * 12) / 2,
            Year_lower: this.options.column_width / 2,
            Year_upper: (this.options.column_width * 30) / 2,
        };

        return {
            upper_text: date_text[`${this.options.view_mode}_upper`],
            lower_text: date_text[`${this.options.view_mode}_lower`],
            upper_x: base_pos.x + x_pos[`${this.options.view_mode}_upper`],
            upper_y: base_pos.upper_y,
            lower_x: base_pos.x + x_pos[`${this.options.view_mode}_lower`],
            lower_y: base_pos.lower_y,
            lower_padding:
                x_pos[`${this.options.view_mode}_lower`] ||
                this.options.padding,
            upper_padding:
                x_pos[`${this.options.view_mode}_upper`] ||
                this.options.padding,
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),

            dayOfWeek: date.getDay(),
        };
    }

    make_bars() {
        this.bars = this.tasks.map((task) => {
            const bar = new Bar(this, task);
            this.layers.bar.appendChild(bar.group);
            return bar;
        });
    }

    make_arrows() {
        this.arrows = [];
        for (let task of this.tasks) {
            if (task._isPlaceholder) continue;
            let arrows = [];
            arrows = task.dependencies
                .map((task_id) => {
                    const dependency = this.get_task(task_id);
                    if (!dependency) return;
                    const arrow = new Arrow(
                        this,
                        this.bars[dependency._index], // from_task
                        this.bars[task._index], // to_task
                    );
                    this.layers.arrow.appendChild(arrow.element);
                    return arrow;
                })
                .filter(Boolean); // filter falsy values
            this.arrows = this.arrows.concat(arrows);
        }
    }

    map_arrows_on_bars() {
        for (let bar of this.bars) {
            bar.arrows = this.arrows.filter((arrow) => {
                return (
                    arrow.from_task.task.id === bar.task.id ||
                    arrow.to_task.task.id === bar.task.id
                );
            });
        }
    }

    set_width() {
        const cur_width = this.$svg.getBoundingClientRect().width;
        const actual_width = this.$svg.querySelector('.grid .grid-row')
            ? this.$svg.querySelector('.grid .grid-row').getAttribute('width')
            : 0;
        if (cur_width < actual_width) {
            this.$svg.setAttribute('width', actual_width);
        }
        this.$svg_header.setAttribute(
            'width',
            parseInt(actual_width) + this.options.column_width,
        );
        this.$svg_header.setAttribute('height', this.options.header_height);
        this.$svg_data_header.setAttribute(
            'height',
            this.options.header_height,
        );
    }

    set_scroll_position() {
        const parent_element = this.$svg.parentElement;
        if (!parent_element) return;
        var view_mode = 'hour';
        switch (this.options.view_mode) {
            case 'Year':
            case 'Week':
            case 'Quarterly': {
                view_mode = 'day';
                break;
            }
            case 'Day':
            case 'Half Day':
            case 'Hour':
            case 'Month':
                view_mode = 'hour';
                break;
        }

        const hours_before_first_task = date_utils.diff(
            this.get_oldest_starting_date(),
            this.gantt_start,
            view_mode,
        );

        let scroll_pos =
            (hours_before_first_task / this.options.step) *
                this.options.column_width -
            this.options.column_width;

        switch (this.options.view_mode) {
            case 'Year': {
                scroll_pos =
                    ((hours_before_first_task * this.options.column_width) /
                        365) *
                        2 -
                    this.options.column_width;
                break;
            }
            case 'Week': {
                scroll_pos =
                    hours_before_first_task * this.options.column_width -
                    this.options.column_width;
                break;
            }
            case 'Quarterly': {
                scroll_pos =
                    ((hours_before_first_task * this.options.column_width) /
                        365) *
                        4 -
                    this.options.column_width;
                break;
            }
        }

        parent_element.scrollLeft = scroll_pos;
    }

    bind_grid_click() {
        if (this.options.on_create_event) {
            let isCreatingTask = false;
            let newTaskStart = null;
            let newTaskEnd = null;
            let tempTaskElement = null;
            let resolvedGroup = null;

            this.$svg.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                const clickX = event.offsetX;
                const clickY = event.offsetY;
                if (
                    event.target.closest('.bar') ||
                    event.target.closest('.task')
                ) {
                    return;
                }
                resolvedGroup = this.get_group_under_click(clickX, clickY);

                if (!resolvedGroup) return;

                isCreatingTask = true;

                const hoursFromStart =
                    (clickX / this.options.column_width) * this.options.step;
                newTaskStart = date_utils.add(
                    this.gantt_start,
                    hoursFromStart,
                    'hour',
                );
                newTaskEnd = newTaskStart;

                tempTaskElement = createSVG('rect', {
                    x: clickX,
                    y: resolvedGroup.getYPosition(this.options),
                    rx: this.options.bar_corner_radius,
                    ry: this.options.bar_corner_radius,
                    width: 0,
                    height: this.options.bar_height,
                    class: 'bar-temp',
                    append_to: this.layers.bar,
                });
            });

            document.addEventListener('mousemove', (e) => {
                if (isCreatingTask && tempTaskElement) {
                    const svgRect = this.$svg.getBoundingClientRect();
                    const cursorX = Math.max(
                        0,
                        Math.min(e.clientX - svgRect.left, svgRect.width),
                    );
                    const startX = parseFloat(
                        tempTaskElement.getAttribute('x'),
                    );

                    const width = Math.max(1, cursorX - startX);
                    tempTaskElement.setAttribute('width', width);

                    newTaskEnd = date_utils.add(
                        this.gantt_start,
                        (Math.max(cursorX, startX) /
                            this.options.column_width) *
                            this.options.step,
                        'hour',
                    );
                }
            });

            document.addEventListener('mouseup', (e) => {
                if (this.popup) {
                    this.popup.update_position();
                }
                if (isCreatingTask && newTaskStart && newTaskEnd) {
                    if (newTaskStart !== newTaskEnd) {
                        isCreatingTask = false;
                        tempTaskElement?.remove();

                        const newTask = {
                            id: `task-${Date.now()}`,
                            title: '',
                            start: newTaskStart,
                            end: newTaskEnd,
                            group: {
                                id: resolvedGroup.id,
                                name: resolvedGroup.name,
                            },
                        };

                        let group = Object.assign(
                            {},
                            {
                                id: newTask.group.id,
                                name: newTask.group.name,
                            },
                        );

                        // For debugging
                        // this.add_task_to_group(newTask, resolvedGroup.id);
                        // this.tasks.push(newTask);
                        // this.refresh(this.tasks);

                        const range = new Range(newTaskStart, newTaskEnd);
                        this.trigger_event('create_event', [e, group, range]);
                    }
                }

                newTaskEnd = null;
                newTaskStart = null;
                resolvedGroup = null;
                isCreatingTask = false;
                tempTaskElement?.remove();
            });
        }
        $.on(
            this.$svg,
            this.options.popup_trigger,
            '.grid-row, .grid-header',
            () => {
                this.unselect_all();
                this.hide_popup();
            },
        );
        this.$task_content.addEventListener('scroll', () => {
            if (this.popup) {
                this.popup.update_position();
            }
        });
    }

    add_task_to_group(newTask, groupTitle) {
        let group = this.groups.find((g) => g.id === groupTitle);

        if (!group) {
            group = new Group('', this.groups.length);
            this.groups.push(group);
        }

        if (group.isPlaceholder) {
            group.replacePlaceholder(newTask);
        } else {
            group.addTask(newTask);
        }
    }

    get_group_under_click(clickX, clickY) {
        const rowIndex = Math.floor(
            clickY / (this.options.bar_height + this.options.padding),
        );
        const group = this.groups[rowIndex];
        return group ? group : null;
    }

    bind_bar_events() {
        let is_dragging = false;
        let is_copying = false;
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing_left = false;
        let is_resizing_right = false;
        let parent_bar_id = null;
        let bars = []; // instanceof Bar
        let resolvedGroup = null;
        this.bar_being_dragged = null;

        function action_in_progress() {
            return (
                is_dragging ||
                is_resizing_left ||
                is_resizing_right ||
                is_copying
            );
        }
        let original_bar = null;
        let temp_bar = null;
        $.on(this.$svg, 'mousedown', '.bar-wrapper', (e, element) => {
            const bar_wrapper = $.closest('.bar-wrapper', element);
            const task_id = bar_wrapper.getAttribute('data-id');
            const bar = this.get_bar(task_id);

            if (!bar) return;

            if (e.ctrlKey) {
                resolvedGroup = this.get_group_under_click(
                    e.offsetX,
                    e.offsetY,
                );
                is_copying = true;
                original_bar = bar;

                temp_bar = createSVG('rect', {
                    x: original_bar.$bar.getX(),
                    y: original_bar.$bar.getY(),
                    rx: this.options.bar_corner_radius,
                    ry: this.options.bar_corner_radius,
                    width: original_bar.$bar.getWidth(),
                    height: this.options.bar_height,
                    class: 'bar-temp',
                    append_to: this.layers.bar,
                });
                temp_bar.style.fill = original_bar.task.background_color;
            } else {
                is_dragging = true;
                original_bar = bar;
            }

            x_on_start = e.offsetX;
            y_on_start = e.offsetY;
        });

        $.on(this.$svg, 'mousedown', '.bar-wrapper, .handle', (e, element) => {
            const bar_wrapper = $.closest('.bar-wrapper', element);

            if (element.classList.contains('left')) {
                is_resizing_left = true;
            } else if (element.classList.contains('right')) {
                is_resizing_right = true;
            } else if (element.classList.contains('bar-wrapper')) {
                is_dragging = true;
            }
            parent_bar_id = bar_wrapper.getAttribute('data-id');
            if (this.get_bar(parent_bar_id).invalid) {
                is_dragging = false;
                return;
            }

            bar_wrapper.classList.add('active');
            x_on_start = e.offsetX;

            y_on_start = e.offsetY;
            let dependents = this.get_all_dependent_tasks(parent_bar_id);
            let ids;
            if (dependents.length > 0) {
                ids = [parent_bar_id, ...dependents];
            } else {
                ids = [parent_bar_id];
            }
            bars = ids.map((id) => this.get_bar(id));

            this.bar_being_dragged = parent_bar_id;
            if (!this.popup) {
                this.popup;
            }
            bars.forEach((bar) => {
                const $bar = bar.$bar;
                $bar.ox = $bar.getX();
                $bar.oy = $bar.getY();
                $bar.owidth = $bar.getWidth();
                $bar.finaldx = 0;
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!action_in_progress()) return;

            const svgRect = this.$svg.getBoundingClientRect();

            const cursorX = Math.max(
                0,
                Math.min(e.clientX - svgRect.left, svgRect.width),
            );
            const cursorY = Math.max(
                0,
                Math.min(e.clientY - svgRect.top, svgRect.height),
            );

            const dx = cursorX - x_on_start;
            const dy = cursorY - y_on_start;

            bars.forEach((bar) => {
                const $bar = bar.$bar;
                $bar.finaldx = this.get_snap_position(dx);

                if (is_resizing_left) {
                    if (parent_bar_id === bar.task.id) {
                        const newWidth = Math.max(
                            $bar.owidth - $bar.finaldx,
                            0,
                        );
                        bar.update_bar_position({
                            x: $bar.ox + $bar.finaldx,
                            width: newWidth,
                        });
                    } else {
                        bar.update_bar_position({
                            x: $bar.ox + $bar.finaldx,
                        });
                    }
                } else if (is_resizing_right) {
                    if (parent_bar_id === bar.task.id) {
                        const newWidth = Math.max(
                            $bar.owidth + $bar.finaldx,
                            0,
                        );
                        bar.update_bar_position({
                            width: newWidth,
                        });
                    }
                } else if (is_copying && temp_bar) {
                    const dx = e.offsetX - x_on_start;
                    const dy = e.offsetY - y_on_start;

                    const new_x =
                        original_bar.$bar.ox + this.get_snap_position(dx);
                    const new_y = original_bar.$bar.oy + dy;

                    temp_bar.setAttribute('x', new_x);
                } else if (is_dragging) {
                    const newX = Math.max(
                        0,
                        Math.min(
                            $bar.ox + $bar.finaldx,
                            svgRect.width - $bar.getWidth(),
                        ),
                    );
                    bar.update_bar_position({ x: newX });
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (action_in_progress()) {
                bars.forEach((bar) => bar.group.classList.remove('active'));
            }
            this.bar_being_dragged = null;
            if (!action_in_progress()) return;
            bars.forEach((bar) => {
                const $bar = bar.$bar;
                if (!$bar.finaldx) return;
                bar.date_changed(e);
                bar.set_action_completed();
            });
            if (is_copying) {
                if (temp_bar && resolvedGroup) {
                    const x = parseFloat(temp_bar.getAttribute('x'));
                    const width = parseFloat(temp_bar.getAttribute('width'));
                    const start_date = date_utils.add(
                        this.gantt_start,
                        (x / this.options.column_width) * this.options.step,
                        'hour',
                    );
                    const end_date = date_utils.add(
                        start_date,
                        (width / this.options.column_width) * this.options.step,
                        'hour',
                    );

                    const original_task = Object.assign(
                        {},
                        {
                            id: original_bar.task.id,
                            title: original_bar.task.title,
                            start: original_bar.task.start,
                            end: original_bar.task.end,
                            group: resolvedGroup,
                            background_color:
                                original_bar.task.background_color,
                        },
                    );

                    const range = new Range(start_date, end_date);
                    this.trigger_event('copy_event', [e, original_task, range]);

                    temp_bar.remove();
                    temp_bar = null;
                }
            }
            is_dragging = false;
            is_resizing_left = false;
            is_resizing_right = false;
            resolvedGroup = null;
            is_copying = false;
            original_bar = null;
            this.hide_popup();
        });

        this.bind_bar_progress();
    }

    bind_context_menu() {
        this.$svg.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.grid-header') || e.target.closest('.date')) {
                return;
            }

            e.preventDefault();
            const target = e.target.closest('.bar-wrapper');
            if (target) {
                const taskId = target.getAttribute('data-id');

                const task = this.tasks.find((t) => t.id === taskId);
                if (task) {
                    this.trigger_event('context_menu', [e, null, task]);
                    return;
                }
            }
            const svgRect = this.$svg.getBoundingClientRect();
            const clickX = e.clientX - svgRect.left;

            const hoursFromStart =
                (clickX / this.options.column_width) * this.options.step;
            const date = date_utils.add(
                this.gantt_start,
                hoursFromStart,
                'hour',
            );
            const group = this.get_group_under_click(e.offsetX, e.offsetY);
            this.trigger_event('context_menu', [e, { date, group }, null]);
        });
    }

    bind_bar_progress() {
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing = null;
        let bar = null;
        let $bar_progress = null;
        let $bar = null;

        $.on(this.$svg, 'mousedown', '.handle.progress', (e, handle) => {
            is_resizing = true;
            x_on_start = e.offsetX;
            y_on_start = e.offsetY;

            const $bar_wrapper = $.closest('.bar-wrapper', handle);
            const id = $bar_wrapper.getAttribute('data-id');
            bar = this.get_bar(id);

            $bar_progress = bar.$bar_progress;
            $bar = bar.$bar;

            $bar_progress.finaldx = 0;
            $bar_progress.owidth = $bar_progress.getWidth();
            $bar_progress.min_dx = -$bar_progress.getWidth();
            $bar_progress.max_dx = $bar.getWidth() - $bar_progress.getWidth();
        });

        $.on(this.$svg, 'mousemove', (e) => {
            if (!is_resizing) return;
            let dx = e.offsetX - x_on_start;
            let dy = e.offsetY - y_on_start;

            if (dx > $bar_progress.max_dx) {
                dx = $bar_progress.max_dx;
            }
            if (dx < $bar_progress.min_dx) {
                dx = $bar_progress.min_dx;
            }

            const $handle = bar.$handle_progress;
            $.attr($bar_progress, 'width', $bar_progress.owidth + dx);
            $.attr($handle, 'points', bar.get_progress_polygon_points());
            $bar_progress.finaldx = dx;
        });

        document.addEventListener('mouseup', (e) => {
            is_resizing = false;
            if (!($bar_progress && $bar_progress.finaldx)) return;
            bar.progress_changed();
            bar.set_action_completed();
        });
    }

    get_all_dependent_tasks(task_id) {
        let out = [];
        let to_process = [task_id];
        while (to_process.length) {
            const deps = to_process.reduce((acc, curr) => {
                acc = acc.concat(this.dependency_map[curr]);
                return acc;
            }, []);

            out = out.concat(deps);
            to_process = deps.filter((d) => !to_process.includes(d));
        }

        return out.filter(Boolean);
    }

    get_snap_position(dx) {
        let odx = dx,
            rem,
            position;

        if (this.view_is(VIEW_MODE.WEEK)) {
            rem = dx % (this.options.column_width / 7);
            position =
                odx -
                rem +
                (rem < this.options.column_width / 14
                    ? 0
                    : this.options.column_width / 7);
        } else if (this.view_is(VIEW_MODE.MONTH)) {
            rem = dx % (this.options.column_width / 30);
            position =
                odx -
                rem +
                (rem < this.options.column_width / 60
                    ? 0
                    : this.options.column_width / 30);
        } else {
            rem = dx % this.options.column_width;
            position =
                odx -
                rem +
                (rem < this.options.column_width / 2
                    ? 0
                    : this.options.column_width);
        }
        return position;
    }

    unselect_all() {
        [...this.$svg.querySelectorAll('.bar-wrapper')].forEach((el) => {
            el.classList.remove('active');
        });
    }

    view_is(modes) {
        if (typeof modes === 'string') {
            return this.options.view_mode === modes;
        }

        if (Array.isArray(modes)) {
            return modes.some((mode) => this.options.view_mode === mode);
        }

        return false;
    }

    get_task(id) {
        return this.tasks.find((task) => {
            return task.id === id;
        });
    }

    get_bar(id) {
        return this.bars.find((bar) => {
            return bar.task.id === id;
        });
    }

    show_popup(options) {
        if (!this.popup) {
            this.popup = new Popup(
                this.popup_wrapper,
                this.options.custom_popup_html,
            );
        }
        this.popup.show(options);
    }

    hide_popup() {
        this.popup && this.popup.hide();
    }

    trigger_event(event, args) {
        if (this.options['on_' + event]) {
            this.options['on_' + event].apply(null, args);
        }
    }

    /**
     * Gets the oldest starting date from the list of tasks
     *
     * @returns Date
     * @memberof Gantt
     */
    get_oldest_starting_date() {
        if (!this.tasks.length) return new Date();
        return this.tasks
            .map((task) => task._start)
            .reduce((prev_date, cur_date) =>
                cur_date <= prev_date ? cur_date : prev_date,
            );
    }

    /**
     * Clear all elements from the parent svg element
     *
     * @memberof Gantt
     */
    clear() {
        this.$svg.innerHTML = '';
        this.$svg_header.innerHTML = '';
    }
}

Gantt.VIEW_MODE = VIEW_MODE;

function generate_id(task) {
    return task.title + '_' + Math.random().toString(36).slice(2, 12);
}
