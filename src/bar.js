import date_utils from './date_utils';
import { $, animateSVG, createSVG } from './svg_utils';
import Range from './utils/range.js';

export default class Bar {
    constructor(gantt, task) {
        this.set_defaults(gantt, task);
        this.prepare();
        this.draw();
        this.bind();
    }

    set_defaults(gantt, task) {
        this.action_completed = false;
        this.gantt = gantt;
        this.task = task;
    }

    prepare() {
        this.prepare_values();
        this.prepare_helpers();
    }

    prepare_values() {
        this.invalid = this.task.invalid;
        this.height = this.gantt.options.bar_height;
        this.handle_width = 8;
        this.x = this.compute_x();
        this.y = this.compute_y();
        this.compute_duration();
        this.corner_radius = this.gantt.options.bar_corner_radius;
        this.width = this.gantt.options.column_width * this.duration;
        this.progress_width =
            this.gantt.options.column_width *
                this.duration *
                (this.task.progress / 100) || 0;
        this.group = createSVG('g', {
            class: 'bar-wrapper ' + (this.task.custom_class || ''),
            'data-id': this.task.id,
        });
        this.bar_group = createSVG('g', {
            class: 'bar-group',
            append_to: this.group,
        });
        this.handle_group = createSVG('g', {
            class: 'handle-group',
            append_to: this.group,
        });
    }

    prepare_helpers() {
        SVGElement.prototype.getX = function () {
            return +this.getAttribute('x');
        };
        SVGElement.prototype.getY = function () {
            return +this.getAttribute('y');
        };
        SVGElement.prototype.getWidth = function () {
            return +this.getAttribute('width');
        };
        SVGElement.prototype.getHeight = function () {
            return +this.getAttribute('height');
        };
        SVGElement.prototype.getEndX = function () {
            return this.getX() + this.getWidth();
        };
    }

    draw() {
        if (this.task._isPlaceholder) return;
        this.draw_bar();
        this.draw_progress_bar();
        this.draw_label();
        this.draw_resize_handles();
        this.render_icon();
    }

    render_icon() {
        if (!this.task.icon) return;
        const icon = this.task.icon;
        const size = this.height / 2;

        const foreignObject = createSVG('foreignObject', {
            width: size,
            height: size,
            class: 'bar-icon',
            append_to: this.bar_group,
        });
        foreignObject.style.pointerEvents = 'none';
        const div = document.createElement('div');
        div.className = `bar-icon${icon ? `-${icon}` : ''}`;
        foreignObject.appendChild(div);
        this.update_icon_position();
    }
    draw_bar() {
        this.$bar = createSVG('rect', {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            rx: this.corner_radius,
            ry: this.corner_radius,
            class:
                'bar' +
                (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
                !this.task.important
                    ? ' safari'
                    : ''),
            append_to: this.bar_group,
        });
        this.$bar.style.fill = this.task.background_color;
        animateSVG(this.$bar, 'width', 0, this.width);

        if (this.invalid) {
            this.$bar.classList.add('bar-invalid');
        }
    }

    draw_progress_bar() {
        if (this.invalid) return;
        this.$bar_progress = createSVG('rect', {
            x: this.x,
            y: this.y,
            width: this.progress_width,
            height: this.height,
            rx: this.corner_radius,
            ry: this.corner_radius,
            class: 'bar-progress',
            append_to: this.bar_group,
        });
        if (!this.gantt.options.progress_enable) {
            this.$bar_progress.style.display = 'none';
        }
        animateSVG(this.$bar_progress, 'width', 0, this.progress_width);
    }

    draw_label() {
        createSVG('text', {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            innerHTML: this.task.title || '',
            class: 'bar-label',
            append_to: this.bar_group,
        });
        // labels get BBox in the next tick
        requestAnimationFrame(() => this.update_label_position());
    }

    draw_resize_handles() {
        if (this.invalid || this.gantt.options.readonly) return;

        const bar = this.$bar;
        const handle_width = this.handle_width;
        if (!this.gantt.options.dates_readonly) {
            createSVG('rect', {
                x: bar.getX() + bar.getWidth() - handle_width - 1,
                y: bar.getY() + 1,
                width: handle_width,
                height: this.height - 2,
                rx: this.corner_radius,
                ry: this.corner_radius,
                class: 'handle right',
                append_to: this.handle_group,
            });

            createSVG('rect', {
                x: bar.getX() + 1,
                y: bar.getY() + 1,
                width: handle_width,
                height: this.height - 2,
                rx: this.corner_radius,
                ry: this.corner_radius,
                class: 'handle left',
                append_to: this.handle_group,
            });
        }

        if (
            this.gantt.options.progress_enable &&
            this.task.progress &&
            this.task.progress < 100
        ) {
            this.$handle_progress = createSVG('polygon', {
                points: this.get_progress_polygon_points().join(','),
                class: 'handle progress',
                append_to: this.handle_group,
            });
        }
    }

    get_progress_polygon_points() {
        const bar_progress = this.$bar_progress;
        return [
            bar_progress.getEndX() - 5,
            bar_progress.getY() + bar_progress.getHeight(),
            bar_progress.getEndX() + 5,
            bar_progress.getY() + bar_progress.getHeight(),
            bar_progress.getEndX(),
            bar_progress.getY() + bar_progress.getHeight() - 8.66,
        ];
    }

    bind() {
        this.setup_click_event();
    }

    setup_click_event() {
        if (this.gantt.options.popup_trigger) {
            $.on(
                this.group,
                'focus ' + this.gantt.options.popup_trigger,
                (e) => {
                    if (this.action_completed) {
                        // just finished a move action, wait for a few seconds
                        return;
                    }
                    this.show_popup();
                    this.gantt.unselect_all();
                    this.group.classList.add('active');
                },
            );
        }

        $.on(this.group, 'dblclick', (e) => {
            if (this.action_completed) {
                // just finished a move action, wait for a few seconds
                return;
            }

            this.gantt.trigger_event('click', [e, this.task]);
        });
    }

    show_popup() {
        if (this.gantt.bar_being_dragged) return;

        const start_date = date_utils.format(
            this.task._start,
            'MMM D YYYY',
            this.gantt.options.language,
        );
        const end_date = date_utils.format(
            date_utils.add(this.task._end, -1, 'second'),
            'MMM D YYYY',
            this.gantt.options.language,
        );
        const subtitle = start_date + ' - ' + end_date;

        this.gantt.show_popup({
            target_element: this.$bar,
            title: this.task.title,
            subtitle: subtitle,
            task: this.task,
        });
    }

    update_bar_position({ x = null, y = null, width = null }) {
        const bar = this.$bar;
        if (x) {
            // get all x values of parent task
            const xs = this.task.dependencies.map((dep) => {
                return this.gantt.get_bar(dep).$bar.getX();
            });
            // child task must not go before parent
            const valid_x = xs.reduce((prev, curr) => {
                return x >= curr;
            }, x);
            if (!valid_x) {
                width = null;
                return;
            }
            this.update_attr(bar, 'x', x);
        }
        if (y !== null) {
            this.y = y;
            this.update_attr(bar, 'y', y);
        }
        if (width && width >= this.handle_width * 2 + 3) {
            this.update_attr(bar, 'width', width);
        }
        this.update_label_position();
        this.update_handle_position();
        this.update_progressbar_position();
        this.update_icon_position();
        this.update_arrow_position();
    }

    update_label_position_on_horizontal_scroll({ x, sx }) {
        const container = document.querySelector('.gantt-container');
        const label = this.group.querySelector('.bar-label');
        const img = this.group.querySelector('.bar-img') || '';
        const img_mask = this.bar_group.querySelector('.img_mask') || '';

        let barWidthLimit = this.$bar.getX() + this.$bar.getWidth();
        let newLabelX = label.getX() + x;
        let newImgX = (img && img.getX() + x) || 0;
        let imgWidth = (img && img.getBBox().width + 7) || 7;
        let labelEndX = newLabelX + label.getBBox().width + 7;
        let viewportCentral = sx + container.clientWidth / 2;

        if (label.classList.contains('big')) return;

        if (labelEndX < barWidthLimit && x > 0 && labelEndX < viewportCentral) {
            label.setAttribute('x', newLabelX);
            if (img) {
                img.setAttribute('x', newImgX);
                img_mask.setAttribute('x', newImgX);
            }
        } else if (
            newLabelX - imgWidth > this.$bar.getX() &&
            x < 0 &&
            labelEndX > viewportCentral
        ) {
            label.setAttribute('x', newLabelX);
            if (img) {
                img.setAttribute('x', newImgX);
                img_mask.setAttribute('x', newImgX);
            }
        }
    }

    date_changed(e) {
        let changed = false;
        const { new_start_date, new_end_date } = this.compute_start_end_date();

        const row_height = this.gantt.options.bar_height + this.gantt.options.padding;
        const new_index = Math.floor(
            (this.$bar.getY() - this.gantt.options.padding / 2) / row_height
        );
        if (new_index !== this.task._index) {
            changed = true;
            this.task._index = new_index;
        }

        if (Number(this.task._start) !== Number(new_start_date)) {
            changed = true;
            this.task._start = new_start_date;
        }

        if (Number(this.task._end) !== Number(new_end_date)) {
            changed = true;
            this.task._end = new_end_date;
        }

        if (!changed) return;

        this.gantt.trigger_event('date_change', [
            e,
            this.task,
            {
                ...this.task,
                start: new_start_date,
                end: new_end_date,
            },
            new Range(
                new_start_date,
                date_utils.add(new_end_date, -1, 'second'),
            ),
        ]);
    }

    task_changed(e) {
        const bar = this.$bar;

        const rowHeight = this.gantt.options.bar_height + this.gantt.options.padding;

        const oldGroupIndex = this.task._index;
        const oldGroup = this.gantt.groups[oldGroupIndex];
        const oldGroupMeta = {
            id: oldGroup.id,
            name: oldGroup.name
        };

        const oldRange = {
            start: this.task._start,
            end: this.task._end
        };

        let groupChanged = false;
        let dateChanged = false;

        // === Проверка смены группы ===
        const newIndex = Math.floor((bar.getY() - this.gantt.options.padding / 2) / rowHeight);
        let newGroupMeta = oldGroupMeta;

        if (newIndex !== this.task._index) {
            const newGroup = this.gantt.groups[newIndex];
            if (newGroup) {
                oldGroup.removeTask(this.task.id);
                newGroup.addTask(this.task);

                this.task._index = newGroup._index;
                this.task.group = {
                    id: newGroup.id,
                    name: newGroup.name
                };

                newGroupMeta = this.task.group;
                groupChanged = true;
            }
        }

        // === Проверка смены даты
        const { new_start_date, new_end_date } = this.compute_start_end_date();
        const newRange = {
            start: new_start_date,
            end: new_end_date
        };

        if (Number(this.task._start) !== Number(new_start_date) ||
            Number(this.task._end) !== Number(new_end_date)) {
            this.task._start = new_start_date;
            this.task._end = new_end_date;
            this.task.start = new_start_date;
            this.task.end = new_end_date;
            dateChanged = true;
        }

        if (groupChanged || dateChanged) {
            this.gantt.trigger_event('event_changed', [
                e,
                this.task,
                {
                    groupChanged,
                    dateChanged,
                    oldGroup: oldGroupMeta,
                    newGroup: newGroupMeta,
                    oldRange,
                    newRange
                }
            ]);
        }
    }

    group_changed(e) {
        const row_height = this.gantt.options.bar_height + this.gantt.options.padding;
        const new_index = Math.floor(
            this.$bar.getY() / row_height,
        );

        if (new_index !== this.task._index) {
            const old_group = this.gantt.groups[this.task._index];
            const new_group = this.gantt.groups[new_index];

            old_group.removeTask(this.task.id);
            new_group.addTask(this.task);

            this.gantt.trigger_event('group_change', [
                e,
                this.task,
                new_group,
                old_group
            ]);
        }
    }

    progress_changed() {
        const new_progress = this.compute_progress();
        this.task.progress = new_progress;
        this.gantt.trigger_event('progress_change', [this.task, new_progress]);
    }

    set_action_completed() {
        this.action_completed = true;
        setTimeout(() => (this.action_completed = false), 1000);
    }

    compute_start_end_date() {
        const bar = this.$bar;
        const x_in_units = bar.getX() / this.gantt.options.column_width;
        let new_start_date = date_utils.add(
            this.gantt.gantt_start,
            x_in_units * this.gantt.options.step,
            'hour',
        );
        const start_offset =
            this.gantt.gantt_start.getTimezoneOffset() -
            new_start_date.getTimezoneOffset();
        if (start_offset) {
            new_start_date = date_utils.add(
                new_start_date,
                start_offset,
                'minute',
            );
        }
        const width_in_units = bar.getWidth() / this.gantt.options.column_width;
        const new_end_date = date_utils.add(
            new_start_date,
            width_in_units * this.gantt.options.step,
            'hour',
        );

        return { new_start_date, new_end_date };
    }

    compute_progress() {
        const progress =
            (this.$bar_progress.getWidth() / this.$bar.getWidth()) * 100;
        return parseInt(progress, 10);
    }

    compute_x() {
        const { step, column_width } = this.gantt.options;
        const task_start = this.task._start;
        const gantt_start = this.gantt.gantt_start;

        const diff = date_utils.diff(task_start, gantt_start, 'hour');
        let x = (diff / step) * column_width;

        if (this.gantt.view_is('Month')) {
            const diff = date_utils.diff(task_start, gantt_start, 'day');
            x = (diff * column_width) / 30;
        }
        return x;
    }

    compute_y() {
        return (
            this.gantt.options.padding / 2 +
            this.task._index * (this.height + this.gantt.options.padding)
        );
    }

    compute_duration() {
        this.duration =
            date_utils.diff(this.task._end, this.task._start, 'hour') /
            this.gantt.options.step;
    }

    get_snap_position(dx) {
        let odx = dx,
            rem,
            position;

        if (this.gantt.view_is('Week')) {
            rem = dx % (this.gantt.options.column_width / 7);
            position =
                odx -
                rem +
                (rem < this.gantt.options.column_width / 14
                    ? 0
                    : this.gantt.options.column_width / 7);
        } else if (this.gantt.view_is('Month')) {
            rem = dx % (this.gantt.options.column_width / 30);
            position =
                odx -
                rem +
                (rem < this.gantt.options.column_width / 60
                    ? 0
                    : this.gantt.options.column_width / 30);
        } else {
            rem = dx % this.gantt.options.column_width;
            position =
                odx -
                rem +
                (rem < this.gantt.options.column_width / 2
                    ? 0
                    : this.gantt.options.column_width);
        }
        return position;
    }

    update_attr(element, attr, value) {
        value = +value;
        if (!isNaN(value)) {
            element.setAttribute(attr, value);
        }
        return element;
    }

    update_progressbar_position() {
        if (
            this.invalid ||
            this.gantt.options.readonly ||
            !this.gantt.options.progress_enable
        )
            return;
        this.$bar_progress.setAttribute('x', this.$bar.getX());
        this.$bar_progress.setAttribute(
            'width',
            this.$bar.getWidth() * (this.task.progress / 100),
        );
    }

    update_icon_position() {
        if (!this.task.icon) return;
        const bar = this.$bar;
        const size = this.height / 2;
        const iconElements = this.group.querySelectorAll('.bar-icon');

        const offsetX = 10;
        const offsetY = (this.height - size) / 2;

        iconElements.forEach((iconElement, index) => {
            const x = bar.getX() + offsetX;
            const y = bar.getY() + offsetY;

            if (iconElement.tagName === 'foreignObject') {
                iconElement.setAttribute('x', x);
                iconElement.setAttribute('y', y);
            } else {
                this.update_attr(iconElement, 'x', x);
                this.update_attr(iconElement, 'y', y);
            }
        });
    }

    update_label_position() {
        const bar = this.$bar,
            label = this.group.querySelector('.bar-label');
        label.setAttribute('y', bar.getY() + this.height / 2);
        if (label.getBBox().width > bar.getWidth()) {
            if (this.gantt.view_is('Month') || this.gantt.view_is('Year')) {
                label.setAttribute('visibility', 'hidden');
            } else {
                label.setAttribute('visibility', 'visible');
            }
            label.classList.add('big');
            label.setAttribute('x', bar.getX() + bar.getWidth() + 5);
        } else {
            label.classList.remove('big');
            label.setAttribute('x', bar.getX() + bar.getWidth() / 2);
            label.setAttribute('visibility', 'visible');
        }
    }

    update_handle_position() {
        if (this.invalid || this.gantt.options.readonly) return;
        const bar = this.$bar;
        this.handle_group
            .querySelector('.handle.left')
            .setAttribute('x', bar.getX() + 1);
        this.handle_group
            .querySelector('.handle.right')
            .setAttribute('x', bar.getEndX() - this.handle_width - 1);
        // y-pos
        this.handle_group
            .querySelector('.handle.left')
            .setAttribute('y', bar.getY() + 1);
        this.handle_group
            .querySelector('.handle.right')
            .setAttribute('y', bar.getY());
        const handle = this.group.querySelector('.handle.progress');
        handle &&
            handle.setAttribute('points', this.get_progress_polygon_points());
    }

    get_vertical_snap_position(dy) {
        const row_height =
            this.gantt.options.bar_height + this.gantt.options.padding;
        return Math.round(dy / row_height) * row_height;
    }

    update_arrow_position() {
        this.arrows = this.arrows || [];
        for (let arrow of this.arrows) {
            arrow.update();
        }
    }
}

function isFunction(functionToCheck) {
    var getType = {};
    return (
        functionToCheck &&
        getType.toString.call(functionToCheck) === '[object Function]'
    );
}
