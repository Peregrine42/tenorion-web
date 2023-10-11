# frozen_string_literal: true

module ApplicationHelper
  def bootstrap_class_for_flash(flash_type)
    case flash_type
    when 'success'
      'bg-success'
    when 'error'
      'bg-danger'
    when 'alert'
      'bg-warning'
    when 'notice'
      'bg-info'
    else
      flash_type.to_s
    end
  end
end
