# frozen_string_literal: true

class ApplicationController < ActionController::Base
  before_action :require_sign_in
  helper_method :signed_in?, :current_user

  def current_user
    return unless session[:user_id]

    @user = User.find(session[:user_id])
  end

  def signed_in?
    !!current_user
  end

  def require_sign_in
    redirect_to :sign_in unless signed_in?
  end
end
