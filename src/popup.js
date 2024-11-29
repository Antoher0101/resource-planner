export default class Popup {
    constructor(parent, custom_html) {
        this.parent = parent;
        this.custom_html = custom_html;
        this.target_element = null;
        this.make();
    }

    make() {
        this.parent.innerHTML = `
            <div class="title"></div>
            <div class="subtitle"></div>
            <div class="pointer"></div>
        `;

        this.hide();

        this.title = this.parent.querySelector('.title');
        this.subtitle = this.parent.querySelector('.subtitle');
        this.pointer = this.parent.querySelector('.pointer');
    }

    show(options) {
        if (!options.target_element) {
            throw new Error('target_element is required to show popup');
        }
        if (!options.position) {
            options.position = 'left';
        }
        this.target_element = options.target_element;

        if (this.custom_html) {
            let html = this.custom_html(options.task);
            html += '<div class="pointer"></div>';
            this.parent.innerHTML = html;
            this.pointer = this.parent.querySelector('.pointer');
        } else {
            // set data
            this.title.innerHTML = options.title ?? '';
            this.subtitle.innerHTML = options.subtitle;
            this.parent.style.width = this.parent.clientWidth + 'px';
        }

        this.update_position();

        // show
        this.parent.style.opacity = 1;
        this.parent.style.pointerEvents = 'auto';
    }

    update_position() {
        if (!this.target_element) return;

        const position_meta = this.target_element.getBoundingClientRect();
        const container_meta =
            this.parent.parentElement.getBoundingClientRect();

        const scrollLeft = this.parent.parentElement.scrollLeft;

        const popupWidth = this.parent.offsetWidth;

        const spaceLeft = position_meta.left - container_meta.left + scrollLeft;
        const spaceRight =
            container_meta.width -
            (position_meta.left - container_meta.left + position_meta.width);

        let popupX;
        let pointerX;

        if (spaceRight >= popupWidth + 10) {
            // not enough space on the left
            popupX =
                position_meta.left -
                container_meta.left +
                scrollLeft +
                position_meta.width +
                10;
            pointerX = '-7px';
            this.pointer.style.transform = 'rotateZ(90deg)';
        } else if (spaceLeft >= popupWidth + 10) {
            popupX =
                position_meta.left -
                container_meta.left +
                scrollLeft -
                popupWidth -
                10;
            pointerX = 'calc(100% + 7px)';
            this.pointer.style.transform = 'rotateZ(-90deg)';
        } else {
            popupX =
                position_meta.left -
                container_meta.left +
                scrollLeft +
                position_meta.width / 2 -
                popupWidth / 2;
            pointerX = '50%';
        }

        this.parent.style.left = `${popupX}px`;
        this.parent.style.top = `${position_meta.top - container_meta.top}px`;

        this.pointer.style.left = pointerX;
        this.pointer.style.top = '2px';
    }

    hide() {
        this.parent.style.opacity = 0;
        this.parent.style.pointerEvents = 'none';
        this.target_element = null;
    }
}
